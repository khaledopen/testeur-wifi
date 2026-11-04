import React, { useState, useEffect, useRef } from 'react';
import { Activity, ArrowDown, ArrowUp, Zap, Globe, HardDrive, Square, Play } from 'lucide-react';

export default function App() {
  // Modes: 'internet' (Cloudflare CDN mondial) ou 'local' (Serveur local python/node)
  const [testMode, setTestMode] = useState('internet');
  const [localServerUrl, setLocalServerUrl] = useState('http://localhost:8000');
  
  const [isRunning, setIsRunning] = useState(true);
  const [phase, setPhase] = useState('ping'); // 'ping', 'download', 'upload'
  const [currentSpeed, setCurrentSpeed] = useState(0);
  const [ping, setPing] = useState(null);
  const [jitter, setJitter] = useState(null);
  const [downloadSpeed, setDownloadSpeed] = useState(null);
  const [uploadSpeed, setUploadSpeed] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');

  const isRunningRef = useRef(true);
  const abortControllerRef = useRef(null);
  const xhrRef = useRef(null);

  // Stop / Resume
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

  // 1. PING & GIGUE (Jitter)
  const runPingTest = async () => {
    if (!isRunningRef.current) return;
    setPhase('ping');

    const pingUrl = testMode === 'internet'
      ? `https://speed.cloudflare.com/__down?bytes=0&t=${Date.now()}`
      : `${localServerUrl}/api/ping?t=${Date.now()}`;

    const pings = [];
    const count = 5;

    for (let i = 0; i < count; i++) {
      if (!isRunningRef.current) return;
      const start = performance.now();
      try {
        const res = await fetch(pingUrl, {
          cache: 'no-store',
          signal: abortControllerRef.current?.signal
        });
        if (!res.ok) throw new Error('Erreur de ping');
        const duration = performance.now() - start;
        pings.push(duration);

        const avg = Math.round(pings.reduce((a, b) => a + b, 0) / pings.length);
        setPing(avg);
        await new Promise(r => setTimeout(r, 90));
      } catch (err) {
        if (!isRunningRef.current) return;
        throw new Error(testMode === 'internet' 
          ? "Impossible de joindre le serveur Cloudflare. Vérifiez votre connexion Internet."
          : "Impossible de joindre le serveur local. Vérifiez qu'il est bien démarré sur le port 8000.");
      }
    }

    let jitterSum = 0;
    for (let i = 1; i < pings.length; i++) {
      jitterSum += Math.abs(pings[i] - pings[i - 1]);
    }
    const avgJitter = pings.length > 1 ? jitterSum / (pings.length - 1) : 0;
    setJitter(Math.round(avgJitter));
  };

  // 2. DOWNLOAD (Débit descendant en direct)
  const runDownloadTest = async () => {
    if (!isRunningRef.current) return;
    setPhase('download');

    // 25 Mo pour tester le vrai débit Internet
    const bytesToFetch = 25 * 1024 * 1024;
    const downloadUrl = testMode === 'internet'
      ? `https://speed.cloudflare.com/__down?bytes=${bytesToFetch}&t=${Date.now()}`
      : `${localServerUrl}/api/download?size_mb=25&t=${Date.now()}`;

    let response;
    try {
      response = await fetch(downloadUrl, {
        signal: abortControllerRef.current?.signal
      });
    } catch (err) {
      if (!isRunningRef.current) return;
      throw err;
    }

    if (!response.body) throw new Error("Flux réseau non supporté par le navigateur");

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

      // Rafraîchissement ultra fluide toutes les 50ms
      if (now - lastTime > 50) {
        const deltaSec = (now - lastTime) / 1000;
        const deltaBits = (receivedBytes - lastBytes) * 8;
        const currentMbps = (deltaBits / deltaSec) / (1024 * 1024);
        const liveVal = Number(Math.max(0, currentMbps).toFixed(2));
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

  // 3. UPLOAD (Débit montant en direct)
  const runUploadTest = async () => {
    if (!isRunningRef.current) return;
    setPhase('upload');

    // 10 Mo pour le téléversement internet
    const totalBytes = (testMode === 'internet' ? 10 : 15) * 1024 * 1024;
    const chunk = new Uint8Array(totalBytes);

    const uploadUrl = testMode === 'internet'
      ? `https://speed.cloudflare.com/__up?t=${Date.now()}`
      : `${localServerUrl}/api/upload?t=${Date.now()}`;

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
          const liveVal = Number(Math.max(0, currentMbps).toFixed(2));
          setCurrentSpeed(liveVal);
          setUploadSpeed(liveVal);
          lastTime = now;
          lastLoaded = event.loaded;
        }
      };

      xhr.onload = () => {
        if (!isRunningRef.current) return resolve(null);
        if (xhr.status >= 200 && xhr.status < 400) {
          const totalSeconds = (performance.now() - startTime) / 1000;
          const finalMbps = Number(((totalBytes * 8 / totalSeconds) / (1024 * 1024)).toFixed(2));
          setUploadSpeed(finalMbps);
          setCurrentSpeed(finalMbps);
          resolve(finalMbps);
        } else {
          resolve(null);
        }
      };

      xhr.onerror = () => {
        if (!isRunningRef.current) return resolve(null);
        resolve(null); // Continue smooth loop even on upload CORS limitations
      };

      xhr.onabort = () => resolve(null);

      xhr.open('POST', uploadUrl);
      xhr.setRequestHeader('Content-Type', 'application/octet-stream');
      xhr.send(chunk);
    });
  };

  // Boucle de mesure en continu
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
          await new Promise(r => setTimeout(r, 400));
        } catch (err) {
          if (!isRunningRef.current || !isSubscribed) break;
          console.error(err);
          setErrorMessage(err.message || 'Erreur lors du test.');
          await new Promise(r => setTimeout(r, 2000));
        }
      }
    };

    loop();

    return () => {
      isSubscribed = false;
      if (abortControllerRef.current) abortControllerRef.current.abort();
      if (xhrRef.current) xhrRef.current.abort();
    };
  }, [isRunning, testMode, localServerUrl]);

  // Jauge dynamique adaptée
  const maxScale = Math.max(50, Math.ceil((currentSpeed || downloadSpeed || uploadSpeed || 0) / 20) * 20);
  const angle = Math.min(180, (currentSpeed / maxScale) * 180);

  return (
    <div className="app-container">
      <header className="header">
        <h1>
          <Zap size={34} color="#00f2fe" /> SpeedTest Pro
        </h1>
        <p>Mesure de votre vitesse Internet en temps réel</p>
      </header>

      {/* Sélecteur de Mode (Vrai Internet vs Réseau Local) */}
      <div className="mode-toggle">
        <button
          className={`mode-btn ${testMode === 'internet' ? 'active' : ''}`}
          onClick={() => {
            setTestMode('internet');
            setDownloadSpeed(null);
            setUploadSpeed(null);
            setPing(null);
          }}
        >
          <Globe size={18} />
          Internet Réel (Cloudflare CDN)
        </button>
        <button
          className={`mode-btn ${testMode === 'local' ? 'active' : ''}`}
          onClick={() => {
            setTestMode('local');
            setDownloadSpeed(null);
            setUploadSpeed(null);
            setPing(null);
          }}
        >
          <HardDrive size={18} />
          Serveur Local (PC / WiFi LAN)
        </button>
      </div>

      {/* Cartes Métriques */}
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
          <div className="metric-label">TÉLÉCHARGEMENT (VITESSE RÉELLE)</div>
          <div className="metric-val">
            {downloadSpeed !== null ? downloadSpeed : '--'}
            <span className="metric-unit">Mbps</span>
          </div>
        </div>

        <div className={`metric-card upload ${isRunning && phase === 'upload' ? 'active' : ''}`}>
          <div className="metric-icon-wrap">
            <ArrowUp size={22} />
          </div>
          <div className="metric-label">TÉLÉVERSEMENT (ENVOI)</div>
          <div className="metric-val">
            {uploadSpeed !== null ? uploadSpeed : '--'}
            <span className="metric-unit">Mbps</span>
          </div>
        </div>
      </div>

      {/* Jauge Speedometer */}
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
            {isRunning && phase === 'ping' && 'Test Latence Internet...'}
            {isRunning && phase === 'download' && 'Download Internet en direct...'}
            {isRunning && phase === 'upload' && 'Upload Internet en direct...'}
          </div>
        </div>
      </div>

      {/* Contrôle STOP / REPRENDRE */}
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

      {/* URL Serveur si mode local */}
      {testMode === 'local' && (
        <div className="settings-bar">
          <HardDrive size={16} />
          <span>Serveur backend local :</span>
          <input
            type="text"
            value={localServerUrl}
            onChange={(e) => setLocalServerUrl(e.target.value)}
            placeholder="http://localhost:8000"
          />
        </div>
      )}
    </div>
  );
}
