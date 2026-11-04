import React, { useState, useRef } from 'react';
import { Activity, ArrowDown, ArrowUp, Zap, Server, RefreshCw, Square } from 'lucide-react';

export default function App() {
  const [serverUrl, setServerUrl] = useState('http://localhost:8000');
  const [status, setStatus] = useState('ready'); // ready, pinging, downloading, uploading, completed, stopped, error
  const [currentSpeed, setCurrentSpeed] = useState(0);
  const [ping, setPing] = useState(null);
  const [jitter, setJitter] = useState(null);
  const [downloadSpeed, setDownloadSpeed] = useState(null);
  const [uploadSpeed, setUploadSpeed] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');

  // Refs for cancellation and live measurement tracking
  const isCancelledRef = useRef(false);
  const abortControllerRef = useRef(null);
  const xhrRef = useRef(null);

  const stopTest = () => {
    isCancelledRef.current = true;
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    if (xhrRef.current) {
      xhrRef.current.abort();
    }
    setStatus('stopped');
    setCurrentSpeed(0);
  };

  // Ping & Jitter measurement
  const testPing = async () => {
    if (isCancelledRef.current) return;
    setStatus('pinging');
    const pings = [];
    const count = 6;

    for (let i = 0; i < count; i++) {
      if (isCancelledRef.current) return;

      const start = performance.now();
      try {
        const res = await fetch(`${serverUrl}/api/ping?t=${Date.now()}`, {
          cache: 'no-store',
          signal: abortControllerRef.current?.signal
        });
        if (!res.ok) throw new Error('Erreur de connexion');
        const duration = performance.now() - start;
        pings.push(duration);

        // Update live ping display as samples arrive
        const currentAvg = Math.round(pings.reduce((a, b) => a + b, 0) / pings.length);
        setPing(currentAvg);

        await new Promise(r => setTimeout(r, 90));
      } catch (err) {
        if (isCancelledRef.current) return;
        throw new Error("Impossible de joindre le serveur. Assurez-vous que le backend tourne sur le port 8000.");
      }
    }

    if (pings.length > 3) {
      pings.sort((a, b) => a - b);
      pings.pop();
    }

    const avgPing = pings.reduce((a, b) => a + b, 0) / pings.length;
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
    if (isCancelledRef.current) return;
    setStatus('downloading');
    const sizeMb = 40; // 40 MB stream for precise real-time speed curve
    
    let response;
    try {
      response = await fetch(`${serverUrl}/api/download?size_mb=${sizeMb}&t=${Date.now()}`, {
        signal: abortControllerRef.current?.signal
      });
    } catch (err) {
      if (isCancelledRef.current) return;
      throw err;
    }

    if (!response.body) throw new Error("ReadableStream non supporté");

    const reader = response.body.getReader();
    let receivedBytes = 0;
    const startTime = performance.now();
    let lastTime = startTime;
    let lastBytes = 0;

    while (true) {
      if (isCancelledRef.current) {
        try { await reader.cancel(); } catch (e) {}
        return;
      }

      let readResult;
      try {
        readResult = await reader.read();
      } catch (e) {
        if (isCancelledRef.current) return;
        throw e;
      }

      const { done, value } = readResult;
      if (done) break;

      receivedBytes += value.length;
      const now = performance.now();

      // Update instant speed every 60ms for smooth live animation
      if (now - lastTime > 60) {
        const deltaSec = (now - lastTime) / 1000;
        const deltaBits = (receivedBytes - lastBytes) * 8;
        const currentMbps = (deltaBits / deltaSec) / (1024 * 1024);
        const liveVal = Number(Math.max(0, currentMbps).toFixed(1));
        setCurrentSpeed(liveVal);
        setDownloadSpeed(liveVal); // Live update in the download card too
        lastTime = now;
        lastBytes = receivedBytes;
      }
    }

    const totalSeconds = (performance.now() - startTime) / 1000;
    const finalMbps = Number(((receivedBytes * 8 / totalSeconds) / (1024 * 1024)).toFixed(2));
    setDownloadSpeed(finalMbps);
    setCurrentSpeed(finalMbps);
    return finalMbps;
  };

  // Upload speed measurement
  const testUpload = async () => {
    if (isCancelledRef.current) return;
    setStatus('uploading');
    setCurrentSpeed(0);

    const totalBytes = 20 * 1024 * 1024; // 20 MB
    const chunk = new Uint8Array(totalBytes);

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhrRef.current = xhr;
      const startTime = performance.now();
      let lastTime = startTime;
      let lastLoaded = 0;

      xhr.upload.onprogress = (event) => {
        if (isCancelledRef.current) return;
        const now = performance.now();
        if (now - lastTime > 60) {
          const deltaSec = (now - lastTime) / 1000;
          const deltaBits = (event.loaded - lastLoaded) * 8;
          const currentMbps = (deltaBits / deltaSec) / (1024 * 1024);
          const liveVal = Number(Math.max(0, currentMbps).toFixed(1));
          setCurrentSpeed(liveVal);
          setUploadSpeed(liveVal); // Live update in the upload card too
          lastTime = now;
          lastLoaded = event.loaded;
        }
      };

      xhr.onload = () => {
        if (isCancelledRef.current) return;
        if (xhr.status >= 200 && xhr.status < 300) {
          const totalSeconds = (performance.now() - startTime) / 1000;
          const finalMbps = Number(((totalBytes * 8 / totalSeconds) / (1024 * 1024)).toFixed(2));
          setUploadSpeed(finalMbps);
          setCurrentSpeed(finalMbps);
          resolve(finalMbps);
        } else {
          reject(new Error("Erreur de transfert upload"));
        }
      };

      xhr.onerror = () => {
        if (isCancelledRef.current) return;
        reject(new Error("Échec du téléversement upload"));
      };

      xhr.onabort = () => {
        resolve(null);
      };

      xhr.open('POST', `${serverUrl}/api/upload?t=${Date.now()}`);
      xhr.setRequestHeader('Content-Type', 'application/octet-stream');
      xhr.send(chunk);
    });
  };

  const runFullTest = async () => {
    isCancelledRef.current = false;
    abortControllerRef.current = new AbortController();
    setErrorMessage('');
    setPing(null);
    setJitter(null);
    setDownloadSpeed(null);
    setUploadSpeed(null);
    setCurrentSpeed(0);

    try {
      await testPing();
      if (isCancelledRef.current) return;
      await new Promise(r => setTimeout(r, 300));
      if (isCancelledRef.current) return;
      await testDownload();
      if (isCancelledRef.current) return;
      await new Promise(r => setTimeout(r, 300));
      if (isCancelledRef.current) return;
      await testUpload();

      if (!isCancelledRef.current) {
        setStatus('completed');
      }
    } catch (err) {
      if (!isCancelledRef.current) {
        console.error(err);
        setErrorMessage(err.message || 'Erreur lors du test.');
        setStatus('error');
      }
    }
  };

  const isTesting = status === 'pinging' || status === 'downloading' || status === 'uploading';

  // Dynamic speedometer gauge limit
  const maxScale = Math.max(100, Math.ceil((currentSpeed || downloadSpeed || uploadSpeed || 0) / 50) * 50);
  const angle = Math.min(180, (currentSpeed / maxScale) * 180);

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
            {downloadSpeed !== null ? downloadSpeed : '--'}
            <span className="metric-unit">Mbps</span>
          </div>
        </div>

        <div className={`metric-card upload ${status === 'uploading' ? 'active' : ''}`}>
          <div className="metric-icon-wrap">
            <ArrowUp size={22} />
          </div>
          <div className="metric-label">TÉLÉVERSEMENT (UP)</div>
          <div className="metric-val">
            {uploadSpeed !== null ? uploadSpeed : '--'}
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
            style={{ transition: 'stroke-dashoffset 0.08s ease-out' }}
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
            {status === 'downloading' && 'Test Download en direct...'}
            {status === 'uploading' && 'Test Upload en direct...'}
            {status === 'completed' && 'Test Terminé'}
            {status === 'stopped' && 'Test Interrompu'}
            {status === 'error' && 'Erreur'}
          </div>
        </div>
      </div>

      {/* Control Buttons (Lancer / Stop) */}
      <div className="buttons-group">
        {!isTesting ? (
          <button className="action-btn" onClick={runFullTest}>
            <RefreshCw size={20} />
            {status === 'completed' || status === 'stopped' ? 'Recommencer le test' : 'LANCER LE TEST'}
          </button>
        ) : (
          <button className="action-btn stop-btn" onClick={stopTest}>
            <Square size={20} fill="currentColor" />
            ARRÊTER (STOP)
          </button>
        )}
      </div>

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
