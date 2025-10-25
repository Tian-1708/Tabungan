import React, { useState, useEffect } from 'react';
import { Card, Form, Button, Modal, Alert } from 'react-bootstrap';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

const Settings = () => {
  const navigate = useNavigate();
  
  // State HANYA untuk Dark Mode
  const [settings, setSettings] = useState({
    dark_mode: false,
  });
  const [settingsError, setSettingsError] = useState('');

  // State HANYA untuk Change Password Modal
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  
  // 1. Ambil Pengaturan Saat Ini (Hanya Dark Mode)
  useEffect(() => {
    const fetchSettings = async () => {
      const token = localStorage.getItem('token');
      if (!token) return navigate('/');
      try {
        // Endpoint ini HANYA mengambil dark_mode
        const res = await axios.get('http://localhost:5000/api/settings', { headers: { 'x-auth-token': token } });
        setSettings({
          dark_mode: res.data.dark_mode === 1,
        });
        document.body.classList.toggle('dark-mode', res.data.dark_mode === 1);
        localStorage.setItem('darkMode', res.data.dark_mode === 1);
      } catch (err) {
        setSettingsError('Failed to load settings. Make sure your server is running.');
        console.error("Error loading settings:", err);
      }
    };
    fetchSettings();
  }, [navigate]);

  // 2. Handler Perubahan Pengaturan (Dark Mode)
  const handleSettingChange = async (settingName, value) => {
    const token = localStorage.getItem('token');
    if (!token) return navigate('/');
    
    // Optimistic UI update
    setSettings(prev => ({ ...prev, [settingName]: value }));

    try {
      await axios.post('http://localhost:5000/api/update-setting', 
        { settingName, value: value ? 1 : 0 }, 
        { headers: { 'x-auth-token': token } }
      );
      
      // Terapkan Dark Mode
      if (settingName === 'dark_mode') {
        document.body.classList.toggle('dark-mode', value);
        localStorage.setItem('darkMode', value);
      }
      setSettingsError('');
    } catch (err) {
      // Rollback state jika error
      setSettings(prev => ({ ...prev, [settingName]: !value }));
      setSettingsError('Failed to update setting.');
      console.error("Error updating setting:", err);
    }
  };

  // 3. Handler Ganti Password
  const handlePasswordChange = async (e) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');

    if (newPassword !== confirmNewPassword) {
      return setPasswordError('New passwords do not match.');
    }

    if (newPassword.length < 6) {
        return setPasswordError('New password must be at least 6 characters.');
    }

    const token = localStorage.getItem('token');
    if (!token) return navigate('/');

    try {
      const res = await axios.post('http://localhost:5000/api/change-password', 
        { currentPassword, newPassword }, 
        { headers: { 'x-auth-token': token } }
      );
      setPasswordSuccess(res.data.msg);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      // Tutup modal setelah sukses
      setTimeout(() => setShowPasswordModal(false), 2000);
    } catch (err) {
      setPasswordError(err.response?.data?.msg || 'Failed to change password.');
    }
  };

  // --- BAGIAN INI ADALAH BAGIAN UTAMA YANG SUDAH DIBERSIHKAN (HANYA DARK MODE DAN CHANGE PASSWORD) ---
  return (
    <div className="container mt-4">
      <h2 className="mb-4">Settings</h2>
      
      {settingsError && <Alert variant="danger">{settingsError}</Alert>}

      {/* CARD PENGATURAN UMUM: HANYA DARK MODE */}
      <Card className="mb-4 shadow-sm">
        <Card.Header>General Settings</Card.Header>
        <Card.Body>
          <Form.Group className="mb-3 d-flex justify-content-between align-items-center">
            <Form.Label className="mb-0">Dark Mode</Form.Label>
            <Form.Check 
              type="switch"
              id="dark-mode-switch"
              checked={settings.dark_mode}
              onChange={(e) => handleSettingChange('dark_mode', e.target.checked)}
            />
          </Form.Group>
          {/* SEMUA ELEMEN LAIN SEPERTI NOTIFIKASI SUDAH DIHAPUS DI SINI */}
        </Card.Body>
      </Card>
      
      {/* CARD KEAMANAN: HANYA CHANGE PASSWORD */}
      <Card className="mb-4 shadow-sm">
        <Card.Header>Account Security</Card.Header>
        <Card.Body>
          <Button variant="outline-primary" onClick={() => setShowPasswordModal(true)}>
            Change Password
          </Button>
          {/* SEMUA TOMBOL LAIN SEPERTI 2FA/SECURITY QUESTION SUDAH DIHAPUS DI SINI */}
        </Card.Body>
      </Card>

      {/* MODAL CHANGE PASSWORD */}
      <Modal show={showPasswordModal} onHide={() => setShowPasswordModal(false)}>
        <Modal.Header closeButton>
          <Modal.Title>Change Password</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {passwordError && <Alert variant="danger">{passwordError}</Alert>}
          {passwordSuccess && <Alert variant="success">{passwordSuccess}</Alert>}
          <Form onSubmit={handlePasswordChange}>
            <Form.Group className="mb-3">
              <Form.Label>Current Password</Form.Label>
              <Form.Control type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>New Password</Form.Label>
              <Form.Control type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Confirm New Password</Form.Label>
              <Form.Control type="password" value={confirmNewPassword} onChange={(e) => setConfirmNewPassword(e.target.value)} required />
            </Form.Group>
            <Button variant="primary" type="submit">Change Password</Button>
          </Form>
        </Modal.Body>
      </Modal>
    </div>
  );
};

export default Settings;