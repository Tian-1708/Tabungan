// file: ForgotPassword.js

import React, { useState } from 'react';
import axios from 'axios';
import { Form, Button, Card, Alert } from 'react-bootstrap';
import { FaPiggyBank } from 'react-icons/fa';
import { Link, useNavigate } from 'react-router-dom'; // Import useNavigate

const ForgotPassword = () => {
  const navigate = useNavigate(); // Hook untuk navigasi
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  // Tambahkan state untuk mengontrol tampilan langkah
  const [otpSent, setOtpSent] = useState(false); 

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage('');
    setError('');

    try {
      // Step 1: Request OTP
      const res = await axios.post('http://localhost:5000/api/forgot-password', { email });
      
      // Jika sukses, atur pesan dan pindah ke mode input OTP
      setMessage(res.data.msg);
      setOtpSent(true); 

    } catch (err) {
      setError(err.response?.data?.msg || 'Failed to send password reset request.');
      setMessage('');
      setOtpSent(false);
    }
  };
  
  // Fungsi yang dijalankan setelah OTP dikirim
  const handleProceedToReset = () => {
      // Navigasi ke halaman ResetPassword, membawa email
      navigate(`/reset-password?email=${email}`);
  };

  return (
    <div className="bg-primary min-vh-100 d-flex align-items-center justify-content-center">
      <Card style={{ width: '25rem' }} className="p-4 shadow-lg">
        <div className="text-center mb-4">
          <FaPiggyBank size={50} className="text-primary mb-2" />
          <h2>Smart Savings</h2>
        </div>
        <h4 className="text-center mb-4">Forgot Password (Step 1)</h4>
        
        {message && <Alert variant="success">{message}</Alert>}
        {error && <Alert variant="danger">{error}</Alert>}
        
        <Form onSubmit={handleSubmit}>
          <Form.Group className="mb-3">
            <Form.Label>Email Address</Form.Label>
            <Form.Control
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={otpSent} // Non-aktifkan setelah OTP dikirim
            />
          </Form.Group>
          
          {!otpSent ? (
            <Button variant="primary" type="submit" className="w-100">
              Send OTP
            </Button>
          ) : (
            <Button variant="success" onClick={handleProceedToReset} className="w-100">
              Proceed to Reset Password
            </Button>
          )}

        </Form>
        
        <div className="text-center mt-3">
          <Link to="/">Back to Sign In</Link>
        </div>
      </Card>
    </div>
  );
};

export default ForgotPassword;