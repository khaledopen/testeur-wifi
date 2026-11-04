import React, { useState, useEffect, useRef } from 'react';
import { Activity, ArrowDown, ArrowUp, Zap, Server, Square, Play } from 'lucide-react';

export default function App() {
  const [serverUrl, setServerUrl] = useState('http://localhost:8000');
  const [isRunning, setIsRunning] = useState(true); // Auto-runs continuously
  const [phase, setPhase] = useState('ping'); // 'ping', 'download', 'upload'
  const [currentSpeed, setCurrentSpeed] = useState(0);
  const [ping, setPing] = useState(null);
  const [jitter, setJitter] = useState(null);
  const [downloadSpeed, setDownloadSpeed] = useState(null);
  const [uploadSpeed, setUploadSpeed] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');

  // Refs for tracking active cancellation & loop state
  const isRunningRef = useRef(true);
  const abortControllerRef = useRef(null);
  const xhrRef = useRef(null);

  // Stop / Resume handlers
  const handleStop = () => {
    isRunningRef.current = false;
    setIsRunning(false);
    if (abortControllerRef.current) abortControllerRef.current.abort();
    if (xhrRef.current) xhrRef.current.abort();
    setCurrentSpeed(0);
  };

  const handleResume = () => {
    setErrorMessage('');
    isRunningRef.current = true;
    setIsRunning(true);
  };

  // Ping & Jitter measurement
  const runPingTest = async () => {
    if (!isRunningRef.current) return;
    setPhase('ping');

    const pings = [];
    const count = 4;

    for (let i = 0; i < count; i++) {
      if (!isRunningRef.current) return;
      const start = performance.now();
      try {
        const res = await fetch(`${serverUrl}/api/ping?t=${Date.now()}`, {
          cache: 'no-store',
          signal: abortControllerRef.current?.signal
        });
        if (!res.ok) throw new Error('Erreur de connexion');
        const duration = performance.now() - start;
        pings.push(duration);

        // Update live ping as each probe returns
        const avg = Math.round(pings.reduce((a, b) => a + b, 0) / pings.length);
        setPing(avg);

        await new Promise(r => setTimeout(r, 80));
      } catch (err) {
        if (!isRunningRef.current) return;
        throw new Error("Impossible de joindre le serveur. Assurez-vous que le backend tourne sur le port 8000.");
      }
    }

    let jitterSum = 0;
    for (let i = 1; i < pings.length; i++) {
      jitterSum += Math.abs(pings[i] - pings[i - 1]);
    }
    const avgJitter = pings.length > 1 ? jitterSum / (pings.length - 1) : 0;
    setJitter(Math.round(avgJitter));
  };

  // Continuous live download stream
  const runDownloadTest = async () => {
    if (!isRunningRef.current) return;
    setPhase('download');

    // 25 MB chunk for each loop cycle
    const sizeMb = 25;
    let response;
    try {
      response = await fetch(`${serverUrl}/api/download?size_mb=${sizeMb}&t=${Date.now()}`, {
        signal: abortControllerRef.current?.signal
      });
    } catch (err) {
      if (!isRunningRef.current) return;
      throw err;
    }

    if (!response.body) throw new Error("ReadableStream non supporté");

    const reader = response.body.getReader();
    let receivedBytes = 0;
    const startTime = performance.now();
    let lastTime = startTime;
    let lastBytes = 0;

    while (true) {
      if (!isRunningRef.current) {
        try { await reader.cancel(); } catch (e) {}
        return;
      }

      let readResult;
      try {
        readResult = await reader.read();
      } catch (e) {
        if (!isRunningRef.current) return;
        throw e;
      }

      const { done, value } = readResult;
      if (done) break;

      receivedBytes += value.length;
      const now = performance.now();

      // Live update every 50ms for hyper-fluid speedometer
      if (now - lastTime > 50) {
        const deltaSec = (now - lastTime) / 1000;
        const deltaBits = (receivedBytes - lastBytes) * 8;
        const currentMbps = (deltaBits / deltaSec) / (1024 * 1024);
        const liveVal = Number(Math.max(0, currentMbps).toFixed(1));
        setCurrentSpeed(liveVal);
        setDownloadSpeed(liveVal);
        lastTime = now;
        lastBytes = receivedBytes;
      }
    }

    const totalSeconds = (performance.now() - startTime) / 1000;
    const finalMbps = Number(((receivedBytes * 8 / totalSeconds) / (1024 * 1024)).toFixed(2));
    setDownloadSpeed(finalMbps);
    setCurrentSpeed(finalMbps);
  };

  // Continuous live upload stream
  const runUploadTest = async () => {
    if (!isRunningRef.current) return;
    setPhase('upload');

    const totalBytes = 15 * 1024 * 1024; // 15 MB
    const chunk = new Uint8Array(totalBytes);

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhrRef.current = xhr;
      const startTime = performance.now();
      let lastTime = startTime;
      let lastLoaded = 0;

      xhr.upload.onprogress = (event) => {
        if (!isRunningRef.current) return;
        const now = performance.now();
        if (now - lastTime > 50) {
          const deltaSec = (now - lastTime) / 1000;
          const deltaBits = (event.loaded - lastLoaded) * 8;
          const currentMbps = (deltaBits / deltaSec) / (1024 * 1024);
          const liveVal = Number(Math.max(0, currentMbps).toFixed(1));
          setCurrentSpeed(liveVal);
          setUploadSpeed(liveVal);
          lastTime = now;
          lastLoaded = event.loaded;
        }
      };

      xhr.onload = () => {
        if (!isRunningRef.current) return resolve(null);
        if (xhr.status >= 200 && xhr.status < 300) {
          const totalSeconds = (performance.now() - startTime) / 1000;
          const finalMbps = Number(((totalBytes * 8 / totalSeconds) / (1024 * 1024)).toFixed(2));
          setUploadSpeed(finalMbps);
          setCurrentSpeed(finalMbps);
          resolve(finalMbps);
        } else {
          reject(new Error("Erreur de téléversement"));
        }
      };

      xhr.onerror = () => {
        if (!isRunningRef.current) return resolve(null);
        reject(new Error("Échec du téléversement"));
      };

      xhr.onabort = () => resolve(null);

      xhr.open('POST', `${serverUrl}/api/upload?t=${Date.now()}`);
      xhr.setRequestHeader('Content-Type', 'application/octet-stream');
      xhr.send(chunk);
    });
  };

  // Continuous monitoring loop: Ping -> Download -> Upload -> Repeat
  useEffect(() => {
    if (!isRunning) return;

    let isSubscribed = true;

    const loop = async () => {
      while (isRunningRef.current && isSubscribed) {
        try {
          abortControllerRef.current = new AbortController();
          
          await runPingTest();
          if (!isRunningRef.current || !isSubscribed) break;
          await new Promise(r => setTimeout(r, 200));

          await runDownloadTest();
          if (!isRunningRef.current || !isSubscribed) break;
          await new Promise(r => setTimeout(r, 200));

          await runUploadTest();
          if (!isRunningRef.current || !isSubscribed) break;
          await new Promise(r => setTimeout(r, 300));
        } catch (err) {
          if (!isRunningRef.current || !isSubscribed) break;
          console.error(err);
          setErrorMessage(err.message || 'Erreur lors de la mesure');
          // Wait 2.5s before retrying in case backend is restarting
          await new Promise(r => setTimeout(r, 2500));
        }
      }
    };

    loop();

    return () => {
      isSubscribed = false;
      if (abortControllerRef.current) abortControllerRef.current.abort();
      if (xhrRef.current) xhrRef.current.abort();
    };
  }, [isRunning, serverUrl]);

  // Dynamic speedometer gauge limit
  const maxScale = Math.max(100, Math.ceil((currentSpeed || downloadSpeed || uploadSpeed || 0) / 50) * 50);
  const angle = Math.min(180, (currentSpeed / maxScale) * 180);

  return (
    <div className="app-container">
      <header className="header">
        <h1>
          <Zap size={34} color="#00f2fe" /> SpeedTest Pro
        </h1>
        <p>Moniteur réseau continu en temps réel</p>
      </header>

      {/* Live Metrics Cards */}
      <div className="metrics-grid">
        <div className={`metric-card ping ${isRunning && phase === 'ping' ? 'active' : ''}`}>
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

        <div className={`metric-card download ${isRunning && phase === 'download' ? 'active' : ''}`}>
          <div className="metric-icon-wrap">
            <ArrowDown size={22} />
          </div>
          <div className="metric-label">TÉLÉCHARGEMENT (DOWN)</div>
          <div className="metric-val">
            {downloadSpeed !== null ? downloadSpeed : '--'}
            <span className="metric-unit">Mbps</span>
          </div>
        </div>

        <div className={`metric-card upload ${isRunning && phase === 'upload' ? 'active' : ''}`}>
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

      {/* Dynamic Real-time Gauge */}
      <div className="gauge-section">
        <svg className="gauge-svg" width="300" height="190" viewBox="0 0 200 125">
          <path
            d="M 20 110 A 80 80 0 0 1 180 110"
            fill="none"
            stroke="rgba(255, 255, 255, 0.08)"
            strokeWidth="14"
            strokeLinecap="round"
          />
          <path
            d="M 20 110 A 80 80 0 0 1 180 110"
            fill="none"
            stroke="url(#gradient)"
            strokeWidth="14"
            strokeDasharray="251.3"
            strokeDashoffset={251.3 - (angle / 180) * 251.3}
            strokeLinecap="round"
            style={{ transition: 'stroke-dashoffset 0.06s ease-out' }}
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
            {!isRunning && 'PAUSE / ARRÊTÉ'}
            {isRunning && phase === 'ping' && 'Mesure Ping en continu...'}
            {isRunning && phase === 'download' && 'Download en direct...'}
            {isRunning && phase === 'upload' && 'Upload en direct...'}
          </div>
        </div>
      </div>

      {/* Only Stop / Reprendre Button */}
      <div className="buttons-group">
        {isRunning ? (
          <button className="action-btn stop-btn" onClick={handleStop}>
            <Square size={20} fill="currentColor" />
            STOP
          </button>
        ) : (
          <button className="action-btn" onClick={handleResume}>
            <Play size={20} fill="currentColor" />
            REPRENDRE LE TEST
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
