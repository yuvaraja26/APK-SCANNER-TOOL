import React, { useState } from 'react';
import {
  AppBar, Toolbar, Typography, Container, Box, Card, CardContent, Grid, Button,
  Tabs, Tab, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper,
  Chip, IconButton, TextField, Snackbar, Alert, CssBaseline, ThemeProvider, createTheme
} from '@mui/material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import KeyIcon from '@mui/icons-material/VpnKey';
import WarningIcon from '@mui/icons-material/Warning';
import ApiIcon from '@mui/icons-material/Api';
import WebAssetIcon from '@mui/icons-material/WebAsset';
import FolderIcon from '@mui/icons-material/Folder';
import DnsIcon from '@mui/icons-material/Dns';
import DownloadIcon from '@mui/icons-material/Download';
import Brightness4Icon from '@mui/icons-material/Brightness4';
import Brightness7Icon from '@mui/icons-material/Brightness7';
import axios from 'axios';

const API_BASE = 'http://localhost:5000';

function TabPanel({ children, value, index }) {
  return value === index && <Box sx={{ pt: 2 }}>{children}</Box>;
}

export default function App() {
  const [apkFile, setApkFile] = useState(null);
  const [scanId, setScanId] = useState(null);
  const [scanStatus, setScanStatus] = useState('');
  const [scanResults, setScanResults] = useState(null);
  const [tab, setTab] = useState(0);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');
  const [themeMode, setThemeMode] = useState("light");

  const theme = createTheme({
    palette: {
      mode: themeMode,
      background: {
        default: themeMode === "dark"
          ? "linear-gradient(135deg, #222 16%, #444 100%)"
          : "linear-gradient(135deg, #fff 70%, #222 100%)"
      }
    },
    typography: {
      fontFamily: 'Montserrat, Roboto, Arial, sans-serif'
    }
  });

  const handleFileChange = e => setApkFile(e.target.files[0]);
  const handleTabChange = (e, val) => setTab(val);
  const handleThemeToggle = () => setThemeMode(prev => prev === "light" ? "dark" : "light");

  const uploadAndScan = async () => {
    if (!apkFile) return setError('Select APK');
    const formData = new FormData(); formData.append('apk', apkFile);
    setScanStatus('scanning'); setScanResults(null);
    try {
      const res = await axios.post(`${API_BASE}/upload`, formData);
      setScanId(res.data.scan_id); pollScanStatus(res.data.scan_id);
    } catch { setError('Upload failed'); setScanStatus(''); }
  };

  const pollScanStatus = (id) => {
    const interval = setInterval(async () => {
      try {
        const res = await axios.get(`${API_BASE}/scan/status/${id}`);
        setScanStatus(res.data.status);
        if (res.data.status === 'completed') {
          clearInterval(interval);
          const out = await axios.get(`${API_BASE}/scan/results/${id}`);
          setScanResults(out.data);
        }
      } catch {
        setError('Scan error.'); clearInterval(interval);
      }
    }, 1200);
  };

  const downloadFile = (fmt) =>
    window.open(`${API_BASE}/scan/download/${scanId}/${fmt}`, '_blank');

  // Filtering helpers per tab
  const filtered = (list, keys) =>
    list?.filter(row => keys.some(k => (row[k] + "").toLowerCase().includes(filter.toLowerCase())));

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box
  sx={{
    minHeight: '100vh',
    backgroundImage: 'url("/background.jpg")',
    backgroundSize: 'cover',
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'center center',
    pt: 0
  }}
>

        <AppBar elevation={0} position="static" sx={{ bgcolor: "transparent", boxShadow: "none" }}>
          <Toolbar sx={{ px: { xs: 1, md: 6 } }}>
            <ApiIcon fontSize="large" sx={{ mr: 2, color: themeMode === "light" ? "#000" : "#fff" }} />
            <Typography variant="h4" sx={{ flexGrow: 1, fontWeight: 900, color: themeMode === "light" ? "#222" : "#fff" }}>
              APK URL Scanner Pro
            </Typography>
            <Typography variant="subtitle1" sx={{ fontWeight: 500, mr: 3, color: themeMode === "light" ? "#444" : "#bbb" }}>
              Welcome back
            </Typography>
            {/* Theme toggle sun/moon icon */}
            <IconButton onClick={handleThemeToggle} color="inherit" sx={{ ml: 2 }}>
              {themeMode === "dark" ? <Brightness7Icon /> : <Brightness4Icon />}
            </IconButton>
          </Toolbar>
        </AppBar>
        <Container maxWidth="lg" sx={{ mt: 3 }}>
          <Grid container spacing={3}>
            <Grid item xs={12} md={5}>
              <Card sx={{
                mb: 3, borderRadius: 4,
                boxShadow: themeMode === "light" ? "0 2px 16px rgba(0,0,0,0.11)" : "0 2px 24px #222"
              }}>
                <CardContent>
                  <Typography fontWeight={700} fontSize={22} gutterBottom>Scan your APK file</Typography>
                  <Box sx={{ my: 3 }}>
                    <Button variant="contained"
                      size='large'
                      component="label"
                      startIcon={<CloudUploadIcon sx={{ color: "#222" }}/>}
                      color="primary"
                      sx={{
                        fontWeight: 600,
                        boxShadow: "0 2px 8px #888",
                        bgcolor: themeMode === "light" ? "#fff" : "#444",
                        color: themeMode === "light" ? "#222" : "#fff"
                      }}>
                      Choose APK
                      <input hidden type="file" accept=".apk" onChange={handleFileChange} />
                    </Button>
                    <Button variant="contained"
                      size="large"
                      color="success"
                      sx={{
                        ml: 2,
                        boxShadow: "0 2px 8px #222",
                        bgcolor: themeMode === "light" ? "#228b22" : "#033802",
                        color: "#fff"
                      }}
                      disabled={!apkFile || scanStatus === 'scanning'}
                      onClick={uploadAndScan}
                    >
                      Start Scan
                    </Button>
                  </Box>
                  <Typography variant="body1">Status: <b>{scanStatus?.toUpperCase() || "IDLE"}</b></Typography>
                  <Box sx={{ height: 22, mt: 2 }}>
                    {scanId && scanResults && (
                      <>
                        <IconButton onClick={() => downloadFile('json')} title="Download JSON">
                          <DownloadIcon color="primary" />
                        </IconButton>
                        <IconButton onClick={() => downloadFile('txt')} title="Download TXT">
                          <DownloadIcon color="success" />
                        </IconButton>
                      </>
                    )}
                  </Box>
                </CardContent>
              </Card>
              {scanResults && (
                <Card sx={{ mb: 3, borderRadius: 4 }}>
                  <CardContent>
                    <Typography fontWeight={600} fontSize={21} gutterBottom>Scan Results</Typography>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', mt: 2, gap: 1 }}>
                      <Chip icon={<ApiIcon />} label={`URLs: ${scanResults.urls?.length || 0}`} variant="outlined" color="primary" />
                      <Chip icon={<DnsIcon />} label={`Domains: ${scanResults.domains?.length || 0}`} variant="outlined" color="secondary" />
                      <Chip icon={<FolderIcon />} label={`Endpoints: ${scanResults.endpoints?.length || 0}`} variant="outlined" color="info" />
                      <Chip icon={<KeyIcon />} label={`Secrets: ${scanResults.sensitive_secrets?.length || 0}`} variant="outlined" color="warning" />
                      <Chip icon={<WarningIcon />} label={`JWTs: ${scanResults.jwt_tokens?.length || 0}`} variant="outlined" color="error" />
                    </Box>
                  </CardContent>
                </Card>
              )}
            </Grid>
            <Grid item xs={12} md={7}>
              {scanResults && (
                <Card sx={{ borderRadius: 4, boxShadow: themeMode === "light" ? "0 2px 16px rgba(0,0,0,0.10)" : "0 2px 18px #222" }}>
                  <CardContent>
                    <Tabs value={tab} onChange={handleTabChange} variant="scrollable" scrollButtons="auto" sx={{ mb:1 }}>
                      <Tab icon={<ApiIcon />} label="URLs" />
                      <Tab icon={<FolderIcon />} label="Endpoints" />
                      <Tab icon={<KeyIcon />} label="Secrets" />
                      <Tab icon={<WarningIcon />} label="Manifest" />
                      <Tab icon={<WebAssetIcon />} label="WebView" />
                      <Tab icon={<DnsIcon />} label="Domains" />
                    </Tabs>
                    <TextField
                      sx={{ mt: 2 }}
                      label="Filter"
                      size="small"
                      value={filter}
                      onChange={e => setFilter(e.target.value)}
                    />
                    {/* URLs */}
                    <TabPanel value={tab} index={0}>
                      <TableContainer component={Paper} sx={{ borderRadius: 3 }}>
                        <Table size="small">
                          <TableHead>
                            <TableRow>
                              <TableCell>URL</TableCell>
                              <TableCell>Source</TableCell>
                              <TableCell>Confidence</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {filtered(scanResults.urls || [], ["url"]).map((row, i) => (
                              <TableRow key={i}>
                                <TableCell>{row.url}</TableCell>
                                <TableCell>{row.source}</TableCell>
                                <TableCell>{Math.round((row.confidence || 0.8) * 100)}%</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    </TabPanel>
                    {/* Endpoints */}
                    <TabPanel value={tab} index={1}>
                      <TableContainer component={Paper} sx={{ borderRadius: 3 }}>
                        <Table size="small">
                          <TableHead>
                            <TableRow>
                              <TableCell>Path</TableCell>
                              <TableCell>Source</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {filtered(scanResults.endpoints || [], ["path"]).map((row, i) => (
                              <TableRow key={i}>
                                <TableCell>{row.path}</TableCell>
                                <TableCell>{row.source}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    </TabPanel>
                    {/* Secrets */}
                    <TabPanel value={tab} index={2}>
                      <TableContainer component={Paper} sx={{ borderRadius: 3 }}>
                        <Table size="small">
                          <TableHead>
                            <TableRow>
                              <TableCell>Type</TableCell>
                              <TableCell>Value</TableCell>
                              <TableCell>Source</TableCell>
                              <TableCell>Severity</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {filtered(scanResults.sensitive_secrets || [], ["value"]).map((row, i) => (
                              <TableRow key={i}>
                                <TableCell>{row.type}</TableCell>
                                <TableCell>{row.value}</TableCell>
                                <TableCell>{row.source}</TableCell>
                                <TableCell>{row.severity}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    </TabPanel>
                    {/* Manifest */}
                    <TabPanel value={tab} index={3}>
                      <Box>
                        {Object.entries(scanResults.manifest_flags || {}).map(([k, v]) =>
                          <Typography key={k} fontWeight={500}>
                            <WarningIcon fontSize="small" /> {k}: {typeof v === "boolean" ? (v ? "Yes" : "No") : JSON.stringify(v)}
                          </Typography>
                        )}
                      </Box>
                    </TabPanel>
                    {/* WebView */}
                    <TabPanel value={tab} index={4}>
                      <TableContainer component={Paper} sx={{ borderRadius: 3 }}>
                        <Table size="small">
                          <TableHead>
                            <TableRow>
                              <TableCell>Origin</TableCell>
                              <TableCell>Hint</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {(scanResults.webview_usages || []).map((row, i) => (
                              <TableRow key={i}>
                                <TableCell>{row.source}</TableCell>
                                <TableCell>{row.hint}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    </TabPanel>
                    {/* Domains */}
                    <TabPanel value={tab} index={5}>
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                        {(scanResults.domains || []).map((v, i) =>
                          <Chip key={i} icon={<DnsIcon />} label={v} color="primary" />
                        )}
                      </Box>
                    </TabPanel>
                  </CardContent>
                </Card>
              )}
            </Grid>
          </Grid>
          <Snackbar open={!!error} autoHideDuration={3200} onClose={() => setError('')}>
            <Alert severity="error">{error}</Alert>
          </Snackbar>
        </Container>
        <Box sx={{
          position: "fixed",
          left: 0,
          bottom: 0,
          width: "100%",
          textAlign: "center",
          color: themeMode === "light" ? '#eee' : '#fff',
          background: "rgba(0,0,0,0.12)",
          fontSize: 15,
          pb: 1,
          fontWeight: 700,
          zIndex:200
        }}>
          APK URL Scanner Pro &copy; 2025 | Welcome back.
        </Box>
      </Box>
    </ThemeProvider>
  );
}
