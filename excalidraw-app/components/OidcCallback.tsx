import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { nanoid } from 'nanoid';

export const OidcCallback: React.FC = () => {
  const { search } = useLocation();
  const navigate = useNavigate();
  const { login } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(search);
    const token = params.get('token');
    const username = params.get('username');
    const role = params.get('role');
    const idStr = params.get('id');

    if (token && username && role && idStr) {
      const user = {
        id: parseInt(idStr, 10),
        username: decodeURIComponent(username),
        role: role as 'ADMIN' | 'USER'
      };
      
      login(token, user);
      
      // Navigate to a new canvas or dashboard after successful login
      navigate(`/`, { replace: true });
    } else {
      setError('Invalid OIDC callback parameters. Missing token or user info.');
    }
  }, [search, login, navigate]);

  if (error) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <h2>Login Error</h2>
        <p style={{ color: 'red' }}>{error}</p>
        <button onClick={() => navigate('/login')}>Back to Login</button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', fontFamily: 'sans-serif' }}>
      <h2>OIDC Login Successful, redirecting...</h2>
    </div>
  );
};
