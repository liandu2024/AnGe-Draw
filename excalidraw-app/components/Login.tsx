import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { nanoid } from 'nanoid';
import { useAuth } from './AuthContext';
import './Login.scss';

export const Login: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [oidcConfig, setOidcConfig] = useState<{ enabled: number; provider_name: string } | null>(null);
  const { login, user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    // Check URL for OIDC error params
    const params = new URLSearchParams(window.location.search);
    const oidcError = params.get('error');
    const oidcErrorDesc = params.get('error_description');
    if (oidcError) {
      setError(`OIDC 登录失败: ${oidcError}${oidcErrorDesc ? ' - ' + oidcErrorDesc : ''}`);
      // Clean up URL
      window.history.replaceState({}, '', '/login');
    }

    const fetchOidcConfig = async () => {
      // Bypass network call in test environment
      if (import.meta.env.MODE === 'test') return;
      try {
        const res = await axios.get('/api/public-oidc-config');
        setOidcConfig(res.data);
      } catch (err) {
        console.error('Failed to fetch public OIDC config', err);
      }
    };
    fetchOidcConfig();
  }, []);

  useEffect(() => {
    if (user) {
      if (window.location.pathname === '/login') {
        navigate(`/`, { replace: true });
      } else {
        navigate('/', { replace: true }); // Fallback if somehow triggered elsewhere
      }
    }
  }, [user, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await axios.post('/api/auth/login', { username, password });
      login(res.data.token, res.data.user);
      navigate(`/`, { replace: true });
    } catch (err: any) {
      setError(err.response?.data?.error || '登录失败');
    }
  };

  const handleOidcLogin = () => {
    // Backend would typically handle this redirect to the OIDC provider
    window.location.href = '/api/auth/oidc/login';
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <h2>AnGe-Draw 登录</h2>
        {error && <div className="error-message">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>用户名</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>
          <div className="form-group">
            <label>密码</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <button type="submit" className="login-button">登录</button>
        </form>
        
        {oidcConfig?.enabled === 1 && (
          <div className="oidc-section">
            <div className="divider">
              <span>或</span>
            </div>
            <button 
              type="button" 
              className="login-button oidc-button" 
              onClick={handleOidcLogin}
            >
              {oidcConfig.provider_name} 登录
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
