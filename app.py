import os
import re
import sys
import zipfile
import json
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import tempfile
import shutil
import xml.etree.ElementTree as ET

app = Flask(__name__)
CORS(app)
UPLOAD_FOLDER = './uploads'
RESULTS_FOLDER = './results'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(RESULTS_FOLDER, exist_ok=True)
scans = {}

# Regex patterns
PATTERNS = {
    "url": re.compile(r"https?://[^\s\"'<>]+"),
    "ws_url": re.compile(r"wss?://[^\s\"'<>]+"),
    "domain": re.compile(r"\b([a-z0-9-]+\.)+[a-z]{2,}\b"),
    "ip": re.compile(r"\b(?:\d{1,3}\.){3}\d{1,3}\b"),
    "jwt": re.compile(r"[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+"),
    "b64": re.compile(r"(?:[A-Za-z0-9+/]{4}){5,}(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?"),
    "endpoint": re.compile(r"\b/(?:api|v\d+|oauth|rest|user|token|login|register|auth|admin)[^\"' \)]*", re.IGNORECASE),
    "apikey": re.compile(r"(api[_-]?key|client[_-]?id|client[_-]?secret|access[_-]?token|firebase|aws_secret|aws_access_key)[^,;\"'\s]+", re.IGNORECASE),
}
# Heuristic indicators
NETWORK_LIB_HINTS = [b"Retrofit", b"OkHttp", b"Volley", b"HttpURLConnection", b"Ktor", b"Fuel", b"apache http"]
WEBVIEW_HINTS = [b"WebView", b"addJavascriptInterface", b"loadUrl", b"evaluateJavascript"]
MANIFEST_PERMISSIONS = [
    "android.permission.INTERNET", "android.permission.ACCESS_NETWORK_STATE",
    "android.permission.ACCESS_WIFI_STATE", "android.permission.WAKE_LOCK"
]

def analyze_manifest(content):
    results = {"internet_permission": False, "exported_receivers": [], "cleartext_traffic": False, "network_security_config": None}
    try:
        root = ET.fromstring(content)
        ns = {'android':"http://schemas.android.com/apk/res/android"}
        # Permissions
        for perm in root.findall(".//uses-permission"):
            name = perm.attrib.get('{http://schemas.android.com/apk/res/android}name', '')
            if name in MANIFEST_PERMISSIONS:
                results["internet_permission"] = True
        # Exported receivers/services
        for comp in root.findall(".//receiver"):
            if comp.attrib.get('{http://schemas.android.com/apk/res/android}exported', '') == 'true':
                results["exported_receivers"].append(comp.attrib.get('{http://schemas.android.com/apk/res/android}name', ''))
        # Cleartext & network security config
        app_node = root.find(".//application")
        if app_node is not None:
            if app_node.attrib.get('{http://schemas.android.com/apk/res/android}usesCleartextTraffic', 'false') == 'true':
                results["cleartext_traffic"] = True
            if '{http://schemas.android.com/apk/res/android}networkSecurityConfig' in app_node.attrib:
                results["network_security_config"] = app_node.attrib['{http://schemas.android.com/apk/res/android}networkSecurityConfig']
    except Exception as e:
        pass
    return results

def extract_all_targets(data, filename):
    results = {
        "urls": [],
        "domains": set(),
        "endpoints": [],
        "sensitive_secrets": [],
        "network_libs": set(),
        "webview_usages": [],
        "jwt_tokens": [],
        "api_base64": [],
        "ips": []
    }
    text = ""
    # Try all major encodings
    for enc in ('utf-8', 'utf-16le', 'latin-1', 'utf-16be'):
        try:
            text = data.decode(enc)
            break
        except:
            continue
    if not text:
        try:
            text = data.decode('ascii', errors='ignore')
        except Exception:
            pass
    # Regex matching
    for m in PATTERNS["url"].findall(text):
        results["urls"].append({"url": m, "source": filename, "confidence": 0.98})
        try:
            domain = re.findall(r"https?://([^/]+)", m)[0]
            results["domains"].add(domain)
        except:
            pass
    for m in PATTERNS["ws_url"].findall(text):
        results["urls"].append({"url": m, "source": filename, "confidence": 0.92})

    for m in PATTERNS["domain"].findall(text):
        results["domains"].add(m)
    for m in PATTERNS["ip"].findall(text):
        results["ips"].append(m)
    for m in PATTERNS["jwt"].findall(text):
        results["jwt_tokens"].append(m)
    for m in PATTERNS["b64"].findall(text):
        results["api_base64"].append(m)
    # API endpoints and secrets
    for m in PATTERNS["endpoint"].findall(text):
        results["endpoints"].append({"method":"?", "path":m, "source":filename})
    for m in PATTERNS["apikey"].findall(text):
        results["sensitive_secrets"].append({"type":"apikey", "value":m, "source":filename, "severity":"high"})
    # Network libs/WebView usage
    for wv in WEBVIEW_HINTS:
        if wv.decode() in text:
            results["webview_usages"].append({"source": filename, "hint": wv.decode()})
    for lib in NETWORK_LIB_HINTS:
        if lib.decode() in text:
            results["network_libs"].add(lib.decode())
    return results

def scan_apk_full(apk_path):
    out_schema = {
        "apk_name": os.path.basename(apk_path),
        "urls": [],
        "domains": set(),
        "endpoints": [],
        "sensitive_secrets": [],
        "network_libs": set(),
        "webview_usages": [],
        "manifest_flags": {},
        "jwt_tokens": [],
        "api_base64": [],
        "ips": [],
        "notes": []
    }
    try:
        z = zipfile.ZipFile(apk_path, 'r')
    except zipfile.BadZipFile:
        return out_schema
    # Scan all files
    for info in z.infolist():
        fname = info.filename
        try:
            data = z.read(fname)
        except Exception:
            continue
        # Manifest scan for manifest only
        if fname.lower().endswith("androidmanifest.xml"):
            try:
                manifest_results = analyze_manifest(data)
                out_schema["manifest_flags"].update(manifest_results)
            except Exception:
                pass
        # Resources
        res_targets = [".xml", ".json", ".properties", ".conf", "strings", ".txt"]
        if any([fname.lower().endswith(e) for e in res_targets]) or "assets/" in fname or "res/raw" in fname:
            res_data = extract_all_targets(data, fname)
            for k in res_data:
                if isinstance(res_data[k], list):
                    out_schema[k].extend(res_data[k])
                else:
                    out_schema[k].update(res_data[k])
        # Code
        if fname.lower().endswith((".dex", ".smali", ".jar", ".class")):
            code_data = extract_all_targets(data, fname)
            for k in code_data:
                if isinstance(code_data[k], list):
                    out_schema[k].extend(code_data[k])
                else:
                    out_schema[k].update(code_data[k])
    # Dedup
    out_schema["domains"] = list(set(out_schema["domains"]))
    out_schema["network_libs"] = list(set(out_schema["network_libs"]))
    out_schema["urls"] = list({d['url']: d for d in out_schema["urls"]}.values())
    out_schema["notes"].append("Schema auto-generated by scanner. Review for accuracy; static limits and false positives exist.")
    return out_schema

@app.route('/upload', methods=['POST'])
def upload_file():
    if 'apk' not in request.files:
        return jsonify({'error': 'No file part'}), 400
    file = request.files['apk']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400
    if not file.filename.endswith('.apk'):
        return jsonify({'error': 'Invalid file type'}), 400
    scan_id = os.urandom(8).hex()
    filepath = os.path.join(UPLOAD_FOLDER, f"{scan_id}.apk")
    file.save(filepath)
    scans[scan_id] = {'status': 'scanning', 'result': None}
    # Run full APK scan
    result = scan_apk_full(filepath)
    scans[scan_id] = {'status': 'completed', 'result': result}
    resultpath = os.path.join(RESULTS_FOLDER, f"{scan_id}.json")
    with open(resultpath, 'w') as f:
        json.dump(result, f, indent=2)
    return jsonify({'scan_id': scan_id}), 202

@app.route('/scan/status/<scan_id>', methods=['GET'])
def get_status(scan_id):
    scan = scans.get(scan_id)
    if not scan:
        return jsonify({'error': 'Scan not found'}), 404
    return jsonify({'status': scan['status']})

@app.route('/scan/results/<scan_id>', methods=['GET'])
def get_results(scan_id):
    scan = scans.get(scan_id)
    if not scan:
        return jsonify({'error': 'Scan not found'}), 404
    if scan['status'] != 'completed':
        return jsonify({'error': 'Scan not completed'}), 400
    return jsonify(scan['result'])

@app.route('/scan/download/<scan_id>/<filetype>', methods=['GET'])
def download_results(scan_id, filetype):
    resultpath = os.path.join(RESULTS_FOLDER, f"{scan_id}.json")
    if not os.path.exists(resultpath):
        return jsonify({'error': 'No such scan' }), 404
    if filetype == 'json':
        return send_file(resultpath, download_name=f'{scan_id}.json', as_attachment=True)
    if filetype == 'txt':
        # flat txt dump
        with open(resultpath) as f:
            data = json.load(f)
        lines = []
        for url in data.get("urls", []):
            lines.append(url["url"])
        for endpoint in data.get("endpoints", []):
            lines.append(endpoint.get("path", ""))
        for secret in data.get("sensitive_secrets", []):
            lines.append(secret.get("value", ""))
        txt_content = '\n'.join(lines)
        txtpath = os.path.join(RESULTS_FOLDER, f"{scan_id}.txt")
        with open(txtpath, 'w') as tf:
            tf.write(txt_content)
        return send_file(txtpath, download_name=f'{scan_id}.txt', as_attachment=True)
    return jsonify({'error': 'Bad filetype, use json/txt'}), 400

if __name__ == "__main__":
    app.run(debug=True, port=5000)
