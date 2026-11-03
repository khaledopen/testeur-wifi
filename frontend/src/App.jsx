import React, { useState, useRef } from 'react';
import { Activity, ArrowDown, ArrowUp, Zap, Server, RefreshCw } from 'lucide-react';

export default function App() {
  const [serverUrl, setServerUrl] = useState('http://localhost:8000');
  const [status, setStatus] = useState('ready'); // ready, pinging, downloading, uploading, completed, error
  const [currentSpeed, setCurrentSpeed] = useState(0);
  const [ping, setPing] = useState(null);
  const [jitter, setJitter] = useState(null);
  const [downloadSpeed, setDownloadSpeed] = useState(null);
  const [uploadSpeed, setUploadSpeed] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');

  const abortControllerRef = useRef(null);

  // Ping & Jitter measurement
  const testPing = async () => {
    setStatus('pinging');
    const pings = [];
    const count = 6;

    for (let i = 0; i < count; i++) {
      const start = performance.now();
      try {
        const res = await fetch(`${serverUrl}/api/ping?t=${Date.now()}`, {
          cache: 'no-store'
        });
        if (!res.ok) throw new Error('Erreur de connexion');
        const duration = performance.now() - start;
        pings.push(duration);
        await new Promise(r => setTimeout(r, 80));
      } catch (err) {
        throw new Error("Impossible de joindre le serveur. Assurez-vous que le backend tourne sur le port 8000.");
      }
    }

    // Discard the highest outlier if > 3 pings
    if (pings.length > 3) {
      pings.sort((a, b) => a - b);
      pings.pop();
    }

    const avgPing = pings.reduce((a, b) => a + b, 0) / pings.length;
    // Jitter: average deviation between consecutive pings
    let jitterSum = 0;
    for (let i = 1; i < pings.length; i++) {
      jitterSum += Math.abs(pings[i] - pings[i - 1]);
    }
    const avgJitter = pings.length > 1 ? jitterSum / (pings.length - 1) : 0;

    setPing(Math.round(avgPing));
    setJitter(Math.round(avgJitter));
    return avgPing;
  };

  // Download speed measurement
  const testDownload = async () => {
    setStatus('downloading');
    const sizeMb = 35; // 35 MB payload
    const response = await fetch(`${serverUrl}/api/download?size_mb=${sizeMb}&t=${Date.now()}`);
    if (!response.body) throw new Error("ReadableStream non supporté");

    const reader = response.body.getReader();
    let receivedBytes = 0;
    const startTime = performance.now();
    let lastTime = startTime;
    let lastBytes = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      receivedBytes += value.length;
      const now = performance.now();

      // Update instant speed every 100ms
      if (now - lastTime > 100) {
        const deltaSec = (now - lastTime) / 1000;
        const deltaBits = (receivedBytes - lastBytes) * 8;
        const currentMbps = (deltaBits / deltaSec) / (1024 * 1024);
        setCurrentSpeed(Math.max(0, currentMbps));
        lastTime = now;
        lastBytes = receivedBytes;
      }
    }

    const totalSeconds = (performance.now() - startTime) / 1000;
    const finalMbps = (receivedBytes * 8 / totalSeconds) / (1024 * 1024);
    const rounded = Number(finalMbps.toFixed(2));
    setDownloadSpeed(rounded);
    setCurrentSpeed(rounded);
    return rounded;
  };

  // Upload speed measurement
  const testUpload = async () => {
    setStatus('uploading');
    setCurrentSpeed(0);

    // Create 15 MB payload of random/dummy bytes
    const totalBytes = 15 * 1024 * 1024;
    const chunk = new Uint8Array(totalBytes);

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const startTime = performance.now();
      let lastTime = startTime;
      let lastLoaded = 0;

      xhr.upload.onprogress = (event) => {
        const now = performance.now();
        if (now - lastTime > 100) {
          const deltaSec = (now - lastTime) / 1000;
          const deltaBits = (event.loaded - lastLoaded) * 8;
          const currentMbps = (deltaBits / deltaSec) / (1024 * 1024);
          setCurrentSpeed(Math.max(0, currentMbps));
          lastTime = now;
          lastLoaded = event.loaded;
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          const totalSeconds = (performance.now() - startTime) / 1000;
          const finalMbps = (totalBytes * 8 / totalSeconds) / (1024 * 1024);
          const rounded = Number(finalMbps.toFixed(2));
          setUploadSpeed(rounded);
          setCurrentSpeed(rounded);
          resolve(rounded);
        } else {
          reject(new Error("Erreur de transfert upload"));
        }
      };

      xhr.onerror = () => reject(new Error("Échec du téléversement upload"));

      xhr.open('POST', `${serverUrl}/api/upload?t=${Date.now()}`);
      xhr.setRequestHeader('Content-Type', 'application/octet-stream');
      xhr.send(chunk);
    });
  };

  const runFullTest = async () => {
    setErrorMessage('');
    setPing(null);
    setJitter(null);
    setDownloadSpeed(null);
    setUploadSpeed(null);
    setCurrentSpeed(0);

    try {
      await testPing();
      await new Promise(r => setTimeout(r, 400));
      await testDownload();
      await new Promise(r => setTimeout(r, 400));
      await testUpload();
      setStatus('completed');
    } catch (err) {
      console.error(err);
      setErrorMessage(err.message || 'Erreur lors du test.');
      setStatus('error');
    }
  };

  // Speedometer SVG Gauge calculation
  // Max scale defaults to 100 Mbps or dynamic if higher
  const maxScale = Math.max(100, Math.ceil((currentSpeed || downloadSpeed || uploadSpeed || 0) / 50) * 50);
  const angle = Math.min(180, (currentSpeed / maxScale) * 180);
  const strokeDashoffset = 283 - (angle / 180) * 283;

  return (
    <div className="app-container">
      <header className="header">
        <h1>
          <Zap size={34} color="#00f2fe" /> SpeedTest Pro
        </h1>
        <p>Testez votre bande passante locale et réseau en temps réel</p>
      </header>

      {/* Metrics Cards */}
      <div className="metrics-grid">
        <div className={`metric-card ping ${status === 'pinging' ? 'active' : ''}`}>
          <div className="metric-icon-wrap">
            <Activity size={22} />
          </div>
          <div className="metric-label">LATENCE (PING)</div>
          <div className="metric-val">
            {ping !== null ? ping : '--'}
            <span className="metric-unit">ms</span>
          </div>
          {jitter !== null && (
            <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: 4 }}>
              Gigue: {jitter} ms
            </div>
          )}
        </div>

        <div className={`metric-card download ${status === 'downloading' ? 'active' : ''}`}>
          <div className="metric-icon-wrap">
            <ArrowDown size={22} />
          </div>
          <div className="metric-label">TÉLÉCHARGEMENT (DOWN)</div>
          <div className="metric-val">
            {downloadSpeed !== null ? downloadSpeed : (status === 'downloading' ? currentSpeed.toFixed(1) : '--')}
            <span className="metric-unit">Mbps</span>
          </div>
        </div>

        <div className={`metric-card upload ${status === 'uploading' ? 'active' : ''}`}>
          <div className="metric-icon-wrap">
            <ArrowUp size={22} />
          </div>
          <div className="metric-label">TÉLÉVERSEMENT (UP)</div>
          <div className="metric-val">
            {uploadSpeed !== null ? uploadSpeed : (status === 'uploading' ? currentSpeed.toFixed(1) : '--')}
            <span className="metric-unit">Mbps</span>
          </div>
        </div>
      </div>

      {/* Modern Circular Gauge */}
      <div className="gauge-section">
        <svg className="gauge-svg" width="300" height="190" viewBox="0 0 200 125">
          {/* Background track */}
          <path
            d="M 20 110 A 80 80 0 0 1 180 110"
            fill="none"
            stroke="rgba(255, 255, 255, 0.08)"
            strokeWidth="14"
            strokeLinecap="round"
          />
          {/* Active progress */}
          <path
            d="M 20 110 A 80 80 0 0 1 180 110"
            fill="none"
            stroke="url(#gradient)"
            strokeWidth="14"
            strokeDasharray="251.3"
            strokeDashoffset={251.3 - (angle / 180) * 251.3}
            strokeLinecap="round"
            style={{ transition: 'stroke-dashoffset 0.15s ease-out' }}
          />
          <defs>
            <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#00f2fe" />
              <stop offset="50%" stopColor="#4facfe" />
              <stop offset="100%" stopColor="#9055ff" />
            </linearGradient>
          </defs>
        </svg>

        <div className="gauge-center-info">
          <div className="gauge-value">{currentSpeed.toFixed(1)}</div>
          <div className="gauge-unit">Mbps</div>
          <div className="gauge-status">
            {status === 'ready' && 'Prêt'}
            {status === 'pinging' && 'Calcul Ping...'}
            {status === 'downloading' && 'Test Download...'}
            {status === 'uploading' && 'Test Upload...'}
            {status === 'completed' && 'Test Terminé'}
            {status === 'error' && 'Erreur'}
          </div>
        </div>
      </div>

      {/* Start Button */}
      <button
        className="action-btn"
        disabled={status === 'pinging' || status === 'downloading' || status === 'uploading'}
        onClick={runFullTest}
      >
        <RefreshCw size={20} className={status === 'pinging' || status === 'downloading' || status === 'uploading' ? 'spin' : ''} />
        {status === 'completed' ? 'Recommencer le test' : 'LANCER LE TEST'}
      </button>

      {errorMessage && (
        <div style={{ marginTop: 20, color: '#f87171', background: 'rgba(239, 68, 68, 0.1)', padding: '10px 20px', borderRadius: '10px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
          {errorMessage}
        </div>
      )}

      {/* Server URL Config */}
      <div className="settings-bar">
        <Server size={16} />
        <span>Serveur backend :</span>
        <input
          type="text"
          value={serverUrl}
          onChange={(e) => setServerUrl(e.target.value)}
          placeholder="http://localhost:8000"
        />
      </div>
    </div>
  );
}

