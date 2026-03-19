import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from './AuthContext';
import './AdminPanel.scss';

export const AdminPanel: React.FC = () => {
  const { token, user, logout } = useAuth();
  const [users, setUsers] = useState<any[]>([]);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState('USER');
  const [error, setError] = useState('');
  const [userToDelete, setUserToDelete] = useState<{id: number, username: string} | null>(null);
  const [editingUser, setEditingUser] = useState<any>(null);

  const [activeTab, setActiveTab] = useState<'account_info' | 'account' | 'oidc'>('account_info');
  const [personalNewPassword, setPersonalNewPassword] = useState('');
  const [personalConfirmPassword, setPersonalConfirmPassword] = useState('');
  const [personalMessage, setPersonalMessage] = useState({ type: '', text: '' });
  const [oidcConfig, setOidcConfig] = useState({
    provider_name: 'OIDC登录',
    client_id: '',
    client_secret: '',
    issuer_url: '',
    enabled: false
  });
  const [oidcSaved, setOidcSaved] = useState(false);

  const fetchUsers = async () => {
    try {
      const res = await axios.get('/api/users', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setUsers(res.data);
    } catch (err) {
      console.error('Failed to fetch users', err);
    }
  };

  useEffect(() => {
    if (user?.role === 'ADMIN') {
      fetchUsers();
      fetchOidcConfig();
    }
  }, [user]);

  const fetchOidcConfig = async () => {
    try {
      const res = await axios.get('/api/oidc-config', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.data) {
        setOidcConfig({
          provider_name: res.data.provider_name || 'OIDC登录',
          client_id: res.data.client_id || '',
          client_secret: res.data.client_secret || '',
          issuer_url: res.data.issuer_url || '',
          enabled: !!res.data.enabled
        });
      }
    } catch (err) {
      console.error('Failed to fetch OIDC config', err);
    }
  };

  const handleSaveOidc = async (e: React.FormEvent) => {
    e.preventDefault();
    setOidcSaved(false);
    try {
      await axios.put('/api/oidc-config', oidcConfig, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setOidcSaved(true);
      setTimeout(() => setOidcSaved(false), 3000);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save OIDC config');
    }
  };

  const handleSubmitUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingUser) {
        await axios.put(`/api/users/${editingUser.id}`, 
          { username: newUsername, role: newRole, ...(newPassword ? { password: newPassword } : {}) },
          { headers: { Authorization: `Bearer ${token}` } }
        );
      } else {
        await axios.post('/api/users', 
          { username: newUsername, password: newPassword, role: newRole },
          { headers: { Authorization: `Bearer ${token}` }}
        );
      }
      resetForm();
      fetchUsers();
    } catch (err: any) {
      setError(err.response?.data?.error || (editingUser ? 'Failed to update user' : 'Failed to create user'));
    }
  };

  const resetForm = () => {
    setEditingUser(null);
    setNewUsername('');
    setNewPassword('');
    setNewRole('USER');
    setError('');
  };

  const handleDeleteUserClick = (id: number, username: string) => {
    setUserToDelete({ id, username });
  };

  const confirmDeleteUser = async () => {
    if (!userToDelete) return;
    try {
      await axios.delete(`/api/users/${userToDelete.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchUsers();
    } catch (err) {
      console.error('Failed to delete user', err);
    } finally {
      setUserToDelete(null);
    }
  };

  const handleEditClick = (u: any) => {
    setEditingUser(u);
    setNewUsername(u.username);
    setNewPassword('');
    setNewRole(u.role);
    setError('');
  };

  const handlePersonalPasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (personalNewPassword !== personalConfirmPassword) {
      setPersonalMessage({ type: 'error', text: '两次输入的密码不一致' });
      return;
    }
    try {
      await axios.put('/api/auth/password', { newPassword: personalNewPassword }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setPersonalMessage({ type: 'success', text: '密码修改成功' });
      setPersonalNewPassword('');
      setPersonalConfirmPassword('');
    } catch (err: any) {
      setPersonalMessage({ type: 'error', text: err.response?.data?.error || '密码修改失败' });
    }
  };

  if (!user) {
    return <div className="admin-panel"><h1>Access Denied: Please log in</h1></div>;
  }

  return (
    <div className="admin-panel">
      
      <div className="admin-tabs">
        <button 
          className={activeTab === 'account_info' ? 'active' : ''} 
          onClick={() => setActiveTab('account_info')}
        >账号信息</button>
        <button 
          className={activeTab === 'account' ? 'active' : ''} 
          onClick={() => user?.role === 'ADMIN' && setActiveTab('account')}
          disabled={user?.role !== 'ADMIN'}
          style={user?.role !== 'ADMIN' ? { opacity: 0.4, cursor: 'not-allowed' } : undefined}
          title={user?.role !== 'ADMIN' ? "此功能仅管理员可用" : ""}
        >账号管理</button>
        <button 
          className={activeTab === 'oidc' ? 'active' : ''} 
          onClick={() => user?.role === 'ADMIN' && setActiveTab('oidc')}
          disabled={user?.role !== 'ADMIN'}
          style={user?.role !== 'ADMIN' ? { opacity: 0.4, cursor: 'not-allowed' } : undefined}
          title={user?.role !== 'ADMIN' ? "此功能仅管理员可用" : ""}
        >OIDC配置</button>
      </div>

      {activeTab === 'account_info' && (
        <div className="account-info-tab" style={{ padding: '0 8px' }}>
          <div style={{ marginBottom: '24px', fontSize: '15px' }}>
            <p style={{ margin: '8px 0' }}><strong>用户名：</strong> {user.username}</p>
            <p style={{ margin: '8px 0' }}><strong>权限角色：</strong> {user.role === 'ADMIN' ? '管理员' : '普通用户'}</p>
            <p style={{ margin: '8px 0' }}><strong>账号类型：</strong> {user.auth_type === 'oidc' ? 'OIDC' : user.auth_type === 'oidc_local' ? 'OIDC/本地' : '本地'}</p>
          </div>
          
          <div className="create-user-form" style={{ marginBottom: '24px' }}>
            <h3>修改密码</h3>
            {personalMessage.text && (
              <div className="message" style={{ color: personalMessage.type === 'error' ? '#ff3b30' : '#34c759', marginBottom: '12px', fontSize: '14px' }}>
                {personalMessage.text}
              </div>
            )}
            <form onSubmit={handlePersonalPasswordChange} style={{ flexDirection: 'column', gap: '12px', alignItems: 'flex-start' }}>
              <input type="password" placeholder="请输入新密码" value={personalNewPassword} onChange={e => setPersonalNewPassword(e.target.value)} required style={{ width: '100%', maxWidth: '300px' }} />
              <input type="password" placeholder="请再次输入新密码" value={personalConfirmPassword} onChange={e => setPersonalConfirmPassword(e.target.value)} required style={{ width: '100%', maxWidth: '300px' }} />
              <button type="submit">修改密码</button>
            </form>
          </div>
          
          <div style={{ borderTop: '1px solid var(--color-gray-20)', paddingTop: '24px' }}>
            <button 
              onClick={() => {
                logout();
                window.location.href = '/login';
              }} 
              style={{ background: '#ff3b30', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
            >
              退出登录
            </button>
          </div>
        </div>
      )}

      {activeTab === 'account' && (
        <>
          <div className="create-user-form">
        <h3>{editingUser ? '修改用户' : '新增用户'}</h3>
        {error && <div className="error">{error}</div>}
        <form onSubmit={handleSubmitUser}>
          <input type="text" placeholder="用户名" value={newUsername} onChange={e => setNewUsername(e.target.value)} required style={{ flex: '1 1 20%', minWidth: 0, backgroundColor: editingUser && (editingUser.auth_type === 'oidc' || editingUser.auth_type === 'oidc_local') ? '#f1f3f5' : undefined, cursor: editingUser && (editingUser.auth_type === 'oidc' || editingUser.auth_type === 'oidc_local') ? 'not-allowed' : undefined }} disabled={!!(editingUser && (editingUser.auth_type === 'oidc' || editingUser.auth_type === 'oidc_local'))} title={editingUser && (editingUser.auth_type === 'oidc' || editingUser.auth_type === 'oidc_local') ? 'OIDC账号用户名不可修改' : ''} />
          <input type="password" placeholder={editingUser ? "新密码(可留空)" : "密码"} value={newPassword} onChange={e => setNewPassword(e.target.value)} required={!editingUser} style={{ flex: '1 1 30%', minWidth: 0 }} />
          <select 
            value={newRole} 
            onChange={e => setNewRole(e.target.value)} 
            style={{ flex: '0 1 auto', minWidth: '70px', backgroundColor: editingUser?.username === 'admin' ? '#f1f3f5' : '#ffffff' }}
            disabled={editingUser?.username === 'admin'}
            title={editingUser?.username === 'admin' ? "内置超级管理员角色不可更改" : ""}
          >
            <option value="USER">普通</option>
            <option value="ADMIN">管理</option>
          </select>
          {editingUser && (
            <button type="button" onClick={resetForm} style={{ padding: '8px 12px', background: 'transparent', color: '#495057', border: '1px solid #ced4da', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px' }}>取消</button>
          )}
          <button type="submit">{editingUser ? '保存' : '新增'}</button>
        </form>
      </div>

      <div className="user-table-container">
        <table className="user-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>用户名</th>
              <th>权限角色</th>
              <th>类型</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id}>
                <td>{u.id}</td>
                <td>{u.username}</td>
                <td>{u.role === 'ADMIN' ? '管理' : '普通'}</td>
                <td>{u.auth_type === 'oidc' ? 'OIDC' : u.auth_type === 'oidc_local' ? 'OIDC/本地' : '本地'}</td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <button onClick={() => handleEditClick(u)} className="edit-btn" style={{ marginRight: '8px', padding: '6px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }} title="修改用户">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                    </button>
                    {u.username !== 'admin' && u.id !== user.id && (
                      <button onClick={() => handleDeleteUserClick(u.id, u.username)} className="delete-btn" style={{ padding: '6px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }} title="删除">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </>
      )}

      {activeTab === 'oidc' && (
        <div className="oidc-config-panel">
          <h3>OIDC (OpenID Connect) 配置</h3>
          <p style={{ color: 'var(--color-gray-50)', fontSize: '14px', marginBottom: '24px' }}>配置使用外部 OIDC (如 Keycloak, Auth0 等) 进行单点登录。</p>
          
          <form onSubmit={handleSaveOidc} noValidate style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
            <div className="oidc-form">
              <div className="form-group checkbox-group">
                <label>启用 OIDC 登录</label>
                <input 
                  type="checkbox" 
                  checked={oidcConfig.enabled} 
                  onChange={e => setOidcConfig({...oidcConfig, enabled: e.target.checked})} 
                />
              </div>
              <div className="form-group">
                <label>显示名称 (按钮名称)</label>
                <input type="text" value={oidcConfig.provider_name} onChange={e => setOidcConfig({...oidcConfig, provider_name: e.target.value})} placeholder="例如: 统一登录 / OIDC登录" />
              </div>
              <div className="form-group">
                <label>Client ID (客户端ID)</label>
                <input type="text" value={oidcConfig.client_id} onChange={e => setOidcConfig({...oidcConfig, client_id: e.target.value})} placeholder="例如: excalidraw-client" />
              </div>
              <div className="form-group">
                <label>Client Secret (客户端密钥)</label>
                <input type="password" value={oidcConfig.client_secret} onChange={e => setOidcConfig({...oidcConfig, client_secret: e.target.value})} placeholder="例如: xxxxxxx-xxxx-xxxx..." />
              </div>
              <div className="form-group">
                <label>Issuer URL (发行者URL)</label>
                <input type="text" value={oidcConfig.issuer_url} onChange={e => setOidcConfig({...oidcConfig, issuer_url: e.target.value})} placeholder="例如: https://auth.example.com/realms/master" />
              </div>

              <div className="form-group">
                <label>Redirect URI (回调地址)</label>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input
                    type="text"
                    readOnly
                    value={`${window.location.origin}/api/auth/oidc/callback`}
                    style={{ background: 'var(--color-gray-10)', cursor: 'text', color: 'var(--color-gray-60)', flex: 1 }}
                    onClick={e => (e.target as HTMLInputElement).select()}
                  />
                  <button
                    type="button"
                    onClick={() => navigator.clipboard.writeText(`${window.location.origin}/api/auth/oidc/callback`)}
                    style={{ padding: '8px 12px', background: 'var(--color-gray-20)', border: '1px solid var(--color-gray-30)', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px', whiteSpace: 'nowrap', color: 'var(--text-primary-color)' }}
                    title="复制回调地址"
                  >
                    复制
                  </button>
                </div>
                <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--color-gray-50)' }}>
                  请将此地址添加到 OIDC 提供商的「允许的回调 URL」列表中。
                </p>
              </div>

            </div>
            
            <div style={{ paddingRight: '16px', flexShrink: 0 }}>
              <button 
                type="submit" 
                className="save-btn"
                style={{ 
                  marginTop: '16px', 
                  alignSelf: 'flex-start',
                  backgroundColor: oidcSaved ? '#2b8a3e' : '#1971c2',
                  transition: 'background-color 0.3s'
                }}
                disabled={oidcSaved}
              >
                {oidcSaved ? '保存成功！' : '保存配置'}
              </button>
            </div>
          </form>
        </div>
      )}

      {userToDelete && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.4)", zIndex: 9999999, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "var(--island-bg-color, white)", padding: "24px", borderRadius: "8px", width: "320px", textAlign: "center", border: "1px solid var(--color-gray-20)", boxShadow: "none" }}>
            <h3 style={{ margin: "0 0 16px 0" }}>确认删除用户？</h3>
            <p style={{ margin: "0 0 24px 0", fontSize: "14px", color: "var(--color-gray-50)" }}>
              您确定要删除用户 <strong>{userToDelete.username}</strong> 吗？此操作不可恢复。
            </p>
            <div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
              <button 
                onClick={() => setUserToDelete(null)}
                style={{ flex: 1, padding: "8px 0", background: "white", color: "#495057", border: "1px solid #ced4da", borderRadius: "6px", cursor: "pointer", fontWeight: "bold" }}
              >取消</button>
              <button 
                onClick={confirmDeleteUser}
                style={{ flex: 1, padding: "8px 0", background: "#e03131", color: "#ffffff", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: "bold" }}
              >确认删除</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
