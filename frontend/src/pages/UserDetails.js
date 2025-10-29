import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Spinner, Alert, ListGroup, Table, Button, Form, Row, Col } from 'react-bootstrap';

const UserDetails = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [user, setUser] = useState(null);
    const [transactions, setTransactions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    
    // State for role, name, and email inputs
    const [newRole, setNewRole] = useState('');
    const [newName, setNewName] = useState('');
    const [newEmail, setNewEmail] = useState('');

    // Separate status states for details (Name/Email) and actions (Role/Reset/Delete)
    const [updateStatus, setUpdateStatus] = useState({ success: '', error: '' }); 
    const [actionStatus, setActionStatus] = useState({ success: '', error: '' }); 

    useEffect(() => {
        const fetchUserDetails = async () => {
            const token = localStorage.getItem('token');
            if (!token) {
                navigate('/');
                return;
            }
            try {
                const res = await axios.get(`http://localhost:5000/api/admin/user/${id}`, {
                    headers: { 'x-auth-token': token }
                });
                
                const fetchedUser = res.data.user; 
                setUser(fetchedUser);
                setTransactions(res.data.transactions);
                
                if (fetchedUser) {
                    setNewRole(fetchedUser.role); 
                    setNewName(fetchedUser.name);
                    setNewEmail(fetchedUser.email);
                } else {
                    setNewRole('user'); 
                    setNewName('');
                    setNewEmail('');
                }
                
                setLoading(false);
            } catch (err) {
                console.error(err);
                setLoading(false);
                setError(err.response?.data?.msg || 'Failed to fetch user details.');
            }
        };

        fetchUserDetails();
    }, [id, navigate]);

    // Handler for updating Role
    const handleRoleChange = async (e) => {
        e.preventDefault();
        setActionStatus({ success: '', error: '' });

        try {
            const token = localStorage.getItem('token');
            const res = await axios.put(`http://localhost:5000/api/admin/user/${id}/role`, 
                { role: newRole },
                { headers: { 'x-auth-token': token } }
            );
            
            if (res.data.user && res.data.user.role) {
                setUser(prevUser => ({ ...prevUser, role: res.data.user.role }));
                setActionStatus({ success: res.data.msg || 'Role updated successfully.', error: '' });
            } else {
                setActionStatus({ success: res.data.msg || 'Role updated successfully.', error: '' });
            }
            
        } catch (err) {
            console.error(err);
            // This handles the 400 status when role is the same
            setActionStatus({ success: '', error: err.response?.data?.msg || 'Failed to update role.' });
        }
    };

    // Handler for updating Name and Email
    const handleUpdateDetails = async (e) => {
        e.preventDefault();
        setUpdateStatus({ success: '', error: '' });

        try {
            const token = localStorage.getItem('token');
            const res = await axios.put(`http://localhost:5000/api/admin/user/${id}`, 
                { name: newName, email: newEmail },
                { headers: { 'x-auth-token': token } }
            );
            
            setUser(prevUser => ({ 
                ...prevUser, 
                name: res.data.user.name, 
                email: res.data.user.email 
            }));
            
            setUpdateStatus({ success: res.data.msg || 'Details updated successfully.', error: '' });
        } catch (err) {
            console.error(err);
            setUpdateStatus({ success: '', error: err.response?.data?.msg || 'Failed to update user details.' });
        }
    };

    // Handler for resetting password
    const handleResetPassword = async () => {
        const confirmReset = window.confirm("Are you sure you want to reset this user's password? A temporary password will be set.");
        if (!confirmReset) return;

        setActionStatus({ success: '', error: '' });

        try {
            const token = localStorage.getItem('token');
            const res = await axios.post(`http://localhost:5000/api/admin/user/${id}/reset-password`, {}, {
                headers: { 'x-auth-token': token }
            });
            setActionStatus({ success: res.data.msg, error: '' });
            alert(`Password Reset Successful. Temporary Password: ${res.data.temporaryPassword}`);
        } catch (err) {
            console.error(err);
            setActionStatus({ success: '', error: err.response?.data?.msg || 'Failed to reset password.' });
        }
    };

    // Handler for deleting user
    const handleDeleteUser = async () => {
        const confirmDelete = window.confirm("CRITICAL WARNING! You are about to permanently delete this user and ALL their related data (transactions, wallets). This action CANNOT be undone. Continue?");
        if (!confirmDelete) return;

        setActionStatus({ success: '', error: '' });

        try {
            const token = localStorage.getItem('token');
            await axios.delete(`http://localhost:5000/api/admin/user/${id}`, {
                headers: { 'x-auth-token': token }
            });
            
            alert('User and all related data successfully deleted.');
            navigate('/admin'); // Redirect admin back to the user list

        } catch (err) {
            console.error(err);
            setActionStatus({ success: '', error: err.response?.data?.msg || 'Failed to delete user. Check console for details.' });
        }
    };
    
    if (loading) {
        return <Spinner animation="border" role="status" className="d-block mx-auto mt-5"><span className="visually-hidden">Loading...</span></Spinner>;
    }

    if (error) {
        return <Alert variant="danger" className="m-5">{error}</Alert>;
    }

    if (!user) {
        return <Alert variant="info" className="m-5">User not found.</Alert>;
    }

    return (
        <>
            <h2 className="mt-4 mb-4">User Details (Admin View)</h2>

            {/* CARD 1: USER DETAILS */}
            <Card className="mb-4">
                <Card.Header as="h5">User Details</Card.Header>
                <Card.Body>
                    <ListGroup variant="flush">
                        <ListGroup.Item><strong>ID:</strong> {user.id}</ListGroup.Item>
                        <ListGroup.Item><strong>Name:</strong> {user.name}</ListGroup.Item>
                        <ListGroup.Item><strong>Email:</strong> {user.email}</ListGroup.Item>
                        <ListGroup.Item><strong>Role:</strong> {user.role}</ListGroup.Item>
                        <ListGroup.Item><strong>Joined:</strong> {new Date(user.created_at).toLocaleDateString()}</ListGroup.Item>
                    </ListGroup>
                </Card.Body>
            </Card>

            {/* CARD 2: EDIT USER DETAILS (NAME/EMAIL) */}
            <Card className="mb-4">
                <Card.Header as="h5">Edit User Details</Card.Header>
                <Card.Body>
                    <Form onSubmit={handleUpdateDetails}>
                        <Form.Group as={Row} className="mb-3" controlId="formUserNewName">
                            <Form.Label column sm="3">Name</Form.Label>
                            <Col sm="9">
                                <Form.Control 
                                    type="text" 
                                    value={newName} 
                                    onChange={(e) => setNewName(e.target.value)} 
                                    required 
                                />
                            </Col>
                        </Form.Group>

                        <Form.Group as={Row} className="mb-3" controlId="formUserNewEmail">
                            <Form.Label column sm="3">Email</Form.Label>
                            <Col sm="9">
                                <Form.Control 
                                    type="email" 
                                    value={newEmail} 
                                    onChange={(e) => setNewEmail(e.target.value)} 
                                    required 
                                />
                            </Col>
                        </Form.Group>

                        {updateStatus.error && <Alert variant="danger">{updateStatus.error}</Alert>}
                        {updateStatus.success && <Alert variant="success">{updateStatus.success}</Alert>}

                        <Button variant="primary" type="submit" className="w-100">
                            Update Details
                        </Button>
                    </Form>
                </Card.Body>
            </Card>

            {/* CARD 3: ADMIN ACTIONS (ROLE, PASSWORD, DELETE) */}
            <Card className="mb-4">
                <Card.Header as="h5">Admin Actions</Card.Header>
                <Card.Body>
                    {/* Display role update/reset/delete status here */}
                    {actionStatus.error && <Alert variant="danger">{actionStatus.error}</Alert>}
                    {actionStatus.success && <Alert variant="success">{actionStatus.success}</Alert>}

                    {/* Update Role Form */}
                    <Form onSubmit={handleRoleChange} className="mb-3 border p-3 rounded">
                        <h6 className="mb-3">Update User Role</h6>
                        <Form.Group as={Row} className="mb-3" controlId="formUserRole">
                            <Form.Label column sm="3">Role</Form.Label>
                            <Col sm="9">
                                <Form.Select value={newRole} onChange={(e) => setNewRole(e.target.value)} required>
                                    <option value="user">User</option>
                                    <option value="admin">Admin</option>
                                </Form.Select>
                            </Col>
                        </Form.Group>

                        <Button variant="success" type="submit" className="w-100">
                            Update Role
                        </Button>
                    </Form>

                    {/* Reset Password Button */}
                    <div className="border p-3 rounded mb-3">
                        <h6 className="mb-3">Password Management</h6>
                        <Button variant="danger" onClick={handleResetPassword} className="w-100">
                            Reset Password
                        </Button>
                    </div>

                    {/* Delete User Button */}
                    <div className="border p-3 rounded">
                        <h6 className="mb-3 text-danger">Danger Zone: Delete User</h6>
                        <Button 
                            variant="danger" 
                            onClick={handleDeleteUser} 
                            className="w-100"
                        >
                            Delete User Permanently
                        </Button>
                    </div>
                </Card.Body>
            </Card>
            
            {/* CARD 4: TRANSACTIONS */}
            <Card className="mb-4">
                <Card.Header as="h5">User Transactions ({transactions.length})</Card.Header>
                <Card.Body>
                    {transactions.length > 0 ? (
                        <Table striped bordered hover responsive>
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Type</th>
                                    <th>Amount</th>
                                    <th>Description</th>
                                    <th>Category</th>
                                </tr>
                            </thead>
                            <tbody>
                                {transactions.map(trans => (
                                    <tr key={trans.id}>
                                        <td>{new Date(trans.created_at).toLocaleString()}</td>
                                        <td>{trans.type}</td>
                                        {/* Assuming amount is stored as string/number and needs formatting */}
                                        <td>Rp{parseFloat(trans.amount).toLocaleString()}</td> 
                                        <td>{trans.description}</td>
                                        <td>{trans.category || '-'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </Table>
                    ) : (
                        <p className="text-center">No transactions found for this user.</p>
                    )}
                </Card.Body>
            </Card>
        </>
    );
};

export default UserDetails;