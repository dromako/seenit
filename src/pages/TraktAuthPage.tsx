import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { initTraktAuth, pollForToken } from '../lib/trakt';

export default function TraktAuthPage() {
  const navigate = useNavigate();
  const [userCode, setUserCode] = useState('');
  const [verificationUrl, setVerificationUrl] = useState('');
  const [deviceCode, setDeviceCode] = useState('');
  const [pollingInterval, setPollingInterval] = useState(5);
  const [loading, setLoading] = useState(true);
  const [polling, setPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const initAuth = async () => {
      try {
        const response = await initTraktAuth();
        if (response) {
          setUserCode(response.user_code);
          setVerificationUrl(response.verification_url);
          setDeviceCode(response.device_code);
          setPollingInterval(response.interval);
          setLoading(false);
          setPolling(true);
        } else {
          setError('Failed to initialize Trakt authentication');
          setLoading(false);
        }
      } catch (err) {
        console.error('Error initializing Trakt auth:', err);
        setError('An error occurred. Please try again.');
        setLoading(false);
      }
    };

    initAuth();
  }, []);

  // Poll for token
  useEffect(() => {
    if (!polling || !deviceCode) return;

    let intervalId: ReturnType<typeof setInterval> | null = null;
    let mounted = true;

    const startPolling = async () => {
      while (mounted) {
        try {
          const success = await pollForToken(deviceCode);
          if (success && mounted) {
            setPolling(false);
            setSuccess(true);
            // Redirect after 2 seconds
            setTimeout(() => {
              if (mounted) {
                navigate('/');
              }
            }, 2000);
            return;
          }
        } catch (err) {
          console.error('Polling error:', err);
        }

        // Wait for interval before polling again
        await new Promise((resolve) => {
          intervalId = setTimeout(resolve, pollingInterval * 1000);
        });
      }
    };

    startPolling();

    return () => {
      mounted = false;
      if (intervalId) {
        clearTimeout(intervalId);
      }
    };
  }, [polling, deviceCode, pollingInterval, navigate]);

  return (
    <div style={{
      padding: '16px',
      maxWidth: '480px',
      margin: '0 auto',
      minHeight: '100dvh',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      paddingBottom: 'env(safe-area-inset-bottom, 16px)'
    }}>
      {/* Loading state */}
      {loading && (
        <>
          <div style={{ textAlign: 'center', marginBottom: '24px' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>⏳</div>
            <h1 style={{
              fontSize: '24px',
              fontWeight: '600',
              color: 'var(--text-primary)',
              marginBottom: '8px'
            }}>
              Initializing
            </h1>
            <p style={{
              fontSize: '14px',
              color: 'var(--text-secondary)',
              margin: '0'
            }}>
              Setting up Trakt connection...
            </p>
          </div>
        </>
      )}

      {/* Error state */}
      {error && !loading && (
        <>
          <div style={{ textAlign: 'center', marginBottom: '24px' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>❌</div>
            <h1 style={{
              fontSize: '24px',
              fontWeight: '600',
              color: 'var(--red)',
              marginBottom: '8px'
            }}>
              Connection Failed
            </h1>
            <p style={{
              fontSize: '14px',
              color: 'var(--text-secondary)',
              margin: '0',
              marginBottom: '16px'
            }}>
              {error}
            </p>
            <button
              onClick={() => {
                window.location.reload();
              }}
              style={{
                padding: '12px 24px',
                backgroundColor: 'var(--accent)',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '500'
              }}
            >
              Try Again
            </button>
          </div>
        </>
      )}

      {/* Success state */}
      {success && (
        <>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>✅</div>
            <h1 style={{
              fontSize: '24px',
              fontWeight: '600',
              color: 'var(--green)',
              marginBottom: '8px'
            }}>
              Connected!
            </h1>
            <p style={{
              fontSize: '14px',
              color: 'var(--text-secondary)',
              margin: '0'
            }}>
              Redirecting to home...
            </p>
          </div>
        </>
      )}

      {/* Auth state */}
      {!loading && !error && !success && (
        <>
          <div style={{ textAlign: 'center', marginBottom: '24px' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>🔓</div>
            <h1 style={{
              fontSize: '24px',
              fontWeight: '600',
              color: 'var(--text-primary)',
              marginBottom: '8px'
            }}>
              Connect Trakt
            </h1>
            <p style={{
              fontSize: '14px',
              color: 'var(--text-secondary)',
              margin: '0'
            }}>
              Authorize SeenIt to access your Trakt account
            </p>
          </div>

          {/* User Code Display */}
          <div
            className="card"
            style={{
              padding: '24px',
              textAlign: 'center',
              marginBottom: '16px'
            }}
          >
            <div style={{
              fontSize: '12px',
              color: 'var(--text-secondary)',
              marginBottom: '12px',
              textTransform: 'uppercase',
              letterSpacing: '1px'
            }}>
              Your Device Code
            </div>
            <div style={{
              fontSize: '48px',
              fontWeight: '700',
              color: 'var(--accent)',
              fontFamily: 'monospace',
              letterSpacing: '4px',
              marginBottom: '16px'
            }}>
              {userCode}
            </div>
            <button
              onClick={() => {
                navigator.clipboard.writeText(userCode);
                alert('Code copied!');
              }}
              style={{
                padding: '10px 16px',
                backgroundColor: 'var(--bg-card)',
                border: '1px solid rgba(255,255,255,0.06)',
                color: 'var(--text-primary)',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: '500'
              }}
            >
              📋 Copy Code
            </button>
          </div>

          {/* Instructions */}
          <div style={{
            backgroundColor: 'rgba(99, 102, 241, 0.1)',
            border: '1px solid rgba(99, 102, 241, 0.2)',
            borderRadius: '8px',
            padding: '16px',
            marginBottom: '16px'
          }}>
            <ol style={{
              margin: '0',
              paddingLeft: '20px',
              color: 'var(--text-primary)',
              fontSize: '14px',
              lineHeight: '1.6'
            }}>
              <li style={{ marginBottom: '8px' }}>
                Go to{' '}
                <strong>
                  <a
                    href={verificationUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      color: 'var(--accent)',
                      textDecoration: 'none'
                    }}
                  >
                    trakt.tv/activate
                  </a>
                </strong>
              </li>
              <li style={{ marginBottom: '8px' }}>
                Enter code: <strong>{userCode}</strong>
              </li>
              <li>Click Authorize</li>
            </ol>
          </div>

          {/* Primary Button */}
          <a
            href={verificationUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'block',
              padding: '14px',
              backgroundColor: 'var(--accent)',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '16px',
              fontWeight: '600',
              textAlign: 'center',
              textDecoration: 'none',
              marginBottom: '12px'
            }}
          >
            Open Trakt.tv
          </a>

          {/* Waiting indicator */}
          <div style={{
            textAlign: 'center',
            padding: '16px',
            backgroundColor: 'var(--bg-card)',
            borderRadius: '8px',
            border: '1px solid rgba(255,255,255,0.06)'
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '8px'
            }}>
              <div style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: 'var(--accent)',
                animation: 'pulse 2s infinite'
              }} />
              <span style={{ fontSize: '14px', color: 'var(--text-secondary)', fontWeight: '500' }}>
                Waiting for authorization
              </span>
            </div>
            <div style={{
              fontSize: '12px',
              color: 'var(--text-secondary)'
            }}>
              This page will refresh automatically once authorized
            </div>
          </div>

          <style>{`
            @keyframes pulse {
              0% { opacity: 1; }
              50% { opacity: 0.5; }
              100% { opacity: 1; }
            }
          `}</style>
        </>
      )}
    </div>
  );
}
