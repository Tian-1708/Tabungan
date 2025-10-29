// file: ResetPassword.js

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Form, Button, Card, Alert } from 'react-bootstrap';
import { FaPiggyBank } from 'react-icons/fa';
import { Link, useLocation, useNavigate } from 'react-router-dom';

const ResetPassword = () => {
  const navigate = useNavigate();
  const location = useLocation(); 
  const [email, setEmail] = useState('');
  // Menggunakan 'otp' untuk menggantikan 'token'
  const [otp, setOtp] = useState(''); 
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  // 1. Ambil Email dari URL Query Parameters
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const urlEmail = params.get('email');
    // Tidak lagi mencari 'token' karena kita menggunakan OTP
    // const urlToken = params.get('token'); 

    if (urlEmail) setEmail(urlEmail);
  }, [location.search]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage('');
    setError('');

    if (newPassword !== confirmPassword) {
      return setError('New password and confirmation do not match.');
    }
    // Pastikan OTP dan email diisi
    if (!email || !otp || !newPassword) {
        return setError('Email, OTP, and New Password are required.');
    }

    try {
      // Memanggil endpoint /api/reset-password di backend
      // Kirim 'otp' sebagai ganti 'token'
      const res = await axios.post('http://localhost:5000/api/reset-password', {
        email,
        otp, // Mengirim OTP
        newPassword
      });
      
      setMessage(res.data.msg + " You will be redirected to Sign In.");
      setError('');
      setTimeout(() => navigate('/'), 3000); 

    } catch (err) {
      setError(err.response?.data?.msg || 'Failed to reset password. OTP may be invalid or expired.');
      setMessage('');
    }
  };

  return (
    <div className="bg-primary min-vh-100 d-flex align-items-center justify-content-center">
      <Card style={{ width: '25rem' }} className="p-4 shadow-lg">
        <div className="text-center mb-4">
          <FaPiggyBank size={50} className="text-primary mb-2" />
          <h2>Smart Savings</h2>
        </div>
        <h4 className="text-center mb-4">Reset Password (Step 2)</h4>
        {message && <Alert variant="success">{message}</Alert>}
        {error && <Alert variant="danger">{error}</Alert>}
        
        <Form onSubmit={handleSubmit}>
          {/* Field Email: Diisi otomatis jika ada di URL */}
          <Form.Group className="mb-3">
            <Form.Label>Email</Form.Label>
            <Form.Control
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              readOnly={!!email}
              className={email ? 'bg-light' : ''}
            />
          </Form.Group>
          
          {/* Field OTP (Menggantikan Token) */}
          <Form.Group className="mb-3">
            <Form.Label>One-Time Password (OTP)</Form.Label>
            <Form.Control
              type="text"
              placeholder="Enter the 6-digit OTP"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              required
              maxLength={6}
            />
            <Form.Text className="text-muted">
              OTP is valid for 10 minutes. Check your email.
            </Form.Text>
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Label>New Password</Form.Label>
            <Form.Control
              type="password"
              placeholder="Enter new password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
            />
          </Form.Group>
          
          <Form.Group className="mb-4">
            <Form.Label>Confirm New Password</Form.Label>
            <Form.Control
              type="password"
              placeholder="Confirm new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </Form.Group>

          <Button variant="primary" type="submit" className="w-100">
            Reset Password
          </Button>
        </Form>
        <div className="text-center mt-3">
          <Link to="/">Back to Sign In</Link>
        </div>
      </Card>
    </div>
  );
};

export default ResetPassword;