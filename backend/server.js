const express = require('express');
const mysql = require('mysql');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const nodemailer = require('nodemailer');

const app = express();
const port = 5000;
const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com', // Opsional, tapi disarankan
    port: 465,              // Port aman untuk SSL/TLS
    secure: true,           // Harus 'true' jika menggunakan port 465
    auth: {
        // Ganti dengan email pengirim Anda
        user: 'GANTI DENGAN AKUN GOOGLE ANDA', 
        // Ganti dengan Sandi Aplikasi 16 karakter dari Langkah 2
        pass: 'GANTI DENGAN SANDI APLIKASI 16 DIGIT' 
    }
});

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'securesave',
    multipleStatements: true
});

db.connect((err) => {
    if (err) {
        console.error('Error connecting to MySQL: ' + err.stack);
        // Hentikan proses Node.js setelah error koneksi fatal
        // Agar server tidak mencoba menjalankan query pada koneksi yang gagal
        process.exit(1); 
        return;
    }
    console.log('Connected to MySQL as id ' + db.threadId);
});

const jwtSecret = 'your_jwt_secret';

const auth = (req, res, next) => {
    const token = req.header('x-auth-token');
    if (!token) {
        return res.status(401).json({ msg: 'No token, authorization denied' });
    }

    try {
        const decoded = jwt.verify(token, jwtSecret);
        req.user = decoded.user;
        next();
    } catch (err) {
        res.status(401).json({ msg: 'Token is not valid' });
    }
};

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadPath = path.join(__dirname, 'uploads');
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath);
        }
        cb(null, 'uploads/');
    },
    filename: function (req, file, cb) {
        cb(null, req.user.id + '-' + Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

app.post('/api/register', async (req, res) => {
    const { name, email, password } = req.body;

    try {
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const newUser = {
            name,
            email,
            password: hashedPassword,
            role: 'user'
        };

        const sql = 'INSERT INTO users SET ?';
        db.query(sql, newUser, (err, result) => {
            if (err) {
                if (err.code === 'ER_DUP_ENTRY') {
                    return res.status(400).json({ msg: 'Email already exists' });
                }
                return res.status(500).json({ msg: 'Server error' });
            }
            res.status(201).json({ msg: 'User registered successfully' });
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server error' });
    }
});

app.post('/api/login', (req, res) => {
    const { email, password } = req.body;

    const sql = 'SELECT id, role, password FROM users WHERE email = ?';
    db.query(sql, [email], async (err, results) => {
        if (err) return res.status(500).json({ msg: 'Server error' });
        if (results.length === 0) {
            return res.status(400).json({ msg: 'Invalid credentials' });
        }

        const user = results[0];
        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
            return res.status(400).json({ msg: 'Invalid credentials' });
        }

        const payload = {
            user: {
                id: user.id,
                role: user.role
            }
        };

        jwt.sign(payload, jwtSecret, { expiresIn: '1h' }, (err, token) => {
            if (err) throw err;
            res.json({ token, role: user.role });
        });
    });
});

app.post('/api/forgot-password', (req, res) => {
    const { email } = req.body; 

    const sql = 'SELECT id, email FROM users WHERE email = ?';
    db.query(sql, [email], (err, results) => { 
        if (err) {
            console.error('Database error in forgot-password:', err);
            return res.status(500).json({ msg: 'Server error' });
        }

        // Always send the same message to prevent email enumeration
        if (results.length === 0) {
            // Log for server-side
            console.log(`Attempted OTP for non-existent email: ${email}`);
            return res.json({ msg: 'If the email exists, an OTP has been sent to your address.' });
        }

        const user = results[0];
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const expires = new Date();
        expires.setMinutes(expires.getMinutes() + 10); 

        // Using existing 'reset_password_token' and 'reset_password_expires' columns
        const updateSql = 'UPDATE users SET reset_password_token = ?, reset_password_expires = ? WHERE id = ?';
        db.query(updateSql, [otp, expires, user.id], async (err, updateResult) => { // <-- ADDED 'async' here
            if (err) {
                console.error('Error saving OTP token:', err);
                return res.status(500).json({ msg: 'Error saving OTP token.' });
            }
            
            // =======================================================
            // REPLACE SIMULATION WITH ACTUAL EMAIL SENDING (Nodemailer)
            // =======================================================
            const mailOptions = {
                from: '"Smart Savings App" <GANTI DENGAN AKUN GOOGLE ANDA>', // Sender email
                to: user.email, // Recipient email
                subject: 'Password Reset Verification Code (OTP)',
                html: `
                    <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #ccc; border-radius: 5px;">
                        <h2>Password Reset Request</h2>
                        <p>Hi ${user.email},</p>
                        <p>We received a request to reset your password.</p>
                        <p>Your Verification Code (OTP) is:</p>
                        <h1 style="color: #007bff; background-color: #f0f8ff; padding: 10px; border-radius: 5px; text-align: center; letter-spacing: 5px;">${otp}</h1>
                        <p>This code is valid for only **10 minutes**.</p>
                        <p>If you did not request a password reset, please ignore this email.</p>
                        <p>Thank you,<br>SecureSave Team</p>
                    </div>
                `,
            };

            try {
                await transporter.sendMail(mailOptions);
                console.log(`[EMAIL SENT] OTP ${otp} successfully sent to ${user.email}`);
            } catch (mailError) {
                console.error('Error sending email:', mailError);
                // Important: Even if email sending fails, we still send a success response to the user
                // to prevent people from discovering which emails are registered.
            }
            
            res.json({ 
                msg: 'An OTP Code has been sent to your email. Please check your inbox (valid for 10 minutes).' 
            });
        });
    });
});

app.post('/api/reset-password', async (req, res) => {
    // Parameter yang diperlukan: email, otp (sebagai ganti token), dan newPassword
    const { email, otp, newPassword } = req.body; 

    // 1. Cek User, OTP, dan Kadaluarsa
    // Menggunakan reset_password_token untuk menyimpan OTP
    const sql = 'SELECT * FROM users WHERE email = ? AND reset_password_token = ? AND reset_password_expires > NOW()';
    // Gunakan 'otp' dari body permintaan untuk validasi
    db.query(sql, [email, otp], async (err, results) => {
        if (err) return res.status(500).json({ msg: 'Server error' });
        if (results.length === 0) {
            return res.status(400).json({ msg: 'Password reset OTP is invalid or has expired.' });
        }

        const user = results[0];
        // 2. Hash Password Baru
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);

        // 3. Update Password dan Hapus Token/OTP
        const updateSql = 'UPDATE users SET password = ?, reset_password_token = NULL, reset_password_expires = NULL WHERE id = ?';
        db.query(updateSql, [hashedPassword, user.id], (err, updateResult) => {
            if (err) return res.status(500).json({ msg: 'Error resetting password.' });
            res.json({ msg: 'Password has been reset successfully. You can now log in with your new password.' });
        });
    });
});

app.post('/api/admin/reset-password/:id', auth, async (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ msg: 'Access denied' });
    }

    const { id } = req.params;

    try {
        const newPassword = crypto.randomBytes(8).toString('hex');
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);

        const sql = 'UPDATE users SET password = ? WHERE id = ?';
        db.query(sql, [hashedPassword, id], (err, result) => {
            if (err) {
                console.error(err);
                return res.status(500).json({ msg: 'Server error: Failed to reset password.' });
            }
            if (result.affectedRows === 0) {
                return res.status(404).json({ msg: 'User not found.' });
            }
            res.json({ msg: 'Password reset successful!', newPassword });
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ msg: 'Server error' });
    }
});

// @route   PUT api/admin/user/:id/role
// @desc    Admin update user role
// @access  Private (Admin only)
app.put('/api/admin/user/:id/role', auth, (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ msg: 'Access denied' });
    }

    const { id } = req.params;
    const { role } = req.body;

    if (!role || (role !== 'user' && role !== 'admin')) {
        return res.status(400).json({ msg: 'Invalid role provided. Must be "user" or "admin".' });
    }

    if (String(req.user.id) === id) {
        return res.status(403).json({ msg: 'You cannot change your own role via this endpoint.' });
    }

    const sql = 'UPDATE users SET role = ? WHERE id = ?';
    db.query(sql, [role, id], (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ msg: 'Server error: Failed to update user role.' });
        }
        if (result.affectedRows === 0) {
            return res.status(404).json({ msg: 'User not found.' });
        }
        res.json({ msg: `User role updated to ${role} successfully.` });
    });
});


app.get('/api/user-dashboard', auth, (req, res) => {
    const { id } = req.user;
    if (req.user.role !== 'user') {
        return res.status(403).json({ msg: 'Access denied' });
    }

    const sqlGoals = 'SELECT * FROM goals WHERE user_id = ?';
    const sqlTransactions = `
        SELECT 
            t.id, t.type, t.amount, t.description, t.category, t.created_at,
            w.name AS wallet_name
        FROM transactions t
        LEFT JOIN wallets w ON t.wallet_id = w.id
        WHERE t.user_id = ? 
        ORDER BY t.created_at DESC`;

    const sqlUser = 'SELECT name FROM users WHERE id = ?';
    const sqlTotalGoalsSavings = 'SELECT SUM(current_amount) AS total_goals_savings FROM goals WHERE user_id = ?';
    const sqlTotalGeneralTransactions = 'SELECT SUM(CASE WHEN type="deposit" AND category IS NOT NULL THEN amount WHEN type="withdrawal" AND category IS NOT NULL THEN -amount ELSE 0 END) AS total_general_transactions FROM transactions WHERE user_id = ?';


    db.query(sqlGoals, [id], (err, goalsResult) => {
        if (err) return res.status(500).json({ msg: 'Server error' });

        db.query(sqlTransactions, [id], (err, transactionsResult) => {
            if (err) return res.status(500).json({ msg: 'Server error' });

            db.query(sqlUser, [id], (err, userResult) => {
                if (err) return res.status(500).json({ msg: 'Server error' });

                db.query(sqlTotalGoalsSavings, [id], (err, totalGoalsSavingsResult) => {
                    if (err) return res.status(500).json({ msg: 'Server error' });

                    db.query(sqlTotalGeneralTransactions, [id], (err, totalTransactionsResult) => {
                        if (err) return res.status(500).json({ msg: 'Server error' });
                    
                        const totalGoalsSavings = totalGoalsSavingsResult[0].total_goals_savings || 0;
                        const totalGeneralTransactions = totalTransactionsResult[0].total_general_transactions || 0;
                        
                        const userData = {
                            total_goals_savings: totalGoalsSavings,
                            total_general_transactions: totalGeneralTransactions,
                            name: userResult[0].name
                        };

                        res.json({
                            user: userData,
                            transactions: transactionsResult,
                            goals: goalsResult
                        });
                    });
                });
            });
        });
    });
});

app.get('/api/admin-dashboard', auth, (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ msg: 'Access denied' });
    }
    
    const { page = 1, limit = 10, search = '' } = req.query;
    const offset = (page - 1) * limit;

    const queries = [
        'SELECT COUNT(id) AS total_users FROM users',
        'SELECT SUM(CASE WHEN type="deposit" THEN amount ELSE -amount END) AS total_savings FROM transactions',
        'SELECT COUNT(id) AS new_users FROM users WHERE DATE(created_at) = CURDATE()',
        `SELECT COUNT(*) AS total_count FROM transactions t JOIN users u ON t.user_id = u.id WHERE u.name LIKE ? OR u.email LIKE ? OR t.description LIKE ? OR t.category LIKE ?`,
        `SELECT u.name, u.email, t.type, t.amount, t.description, t.category, t.created_at FROM users u JOIN transactions t ON u.id = t.user_id WHERE u.name LIKE ? OR u.email LIKE ? OR t.description LIKE ? OR t.category LIKE ? ORDER BY t.created_at DESC LIMIT ? OFFSET ?`
    ];

    const likeSearch = `%${search}%`;
    const params = [likeSearch, likeSearch, likeSearch, likeSearch, likeSearch, likeSearch, likeSearch, likeSearch, parseInt(limit), parseInt(offset)];
    
    db.query(queries.join(';'), params, (err, results) => {
        if (err) {
            console.error('Server error:', err);
            return res.status(500).json({ msg: 'Server error', error: err.message });
        }
        
        const [totalUsersResult, totalSavingsResult, newUsersTodayResult, totalActivityCountResult, recentActivityResult] = results;

        res.json({
            totalUsers: totalUsersResult[0].total_users || 0,
            totalSavings: totalSavingsResult[0].total_savings || 0,
            newUsersToday: newUsersTodayResult[0].new_users || 0,
            totalActivityCount: totalActivityCountResult[0].total_count || 0,
            recentActivity: recentActivityResult || []
        });
    });
});

// @route   DELETE api/admin/user/:id
// @desc    Admin delete user (with related data cleanup)
// @access  Private (Admin only)
app.delete('/api/admin/user/:id', auth, (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ msg: 'Access denied' });
    }

    const { id: userIdToDelete } = req.params;
    const currentUserId = req.user.id;
    
    // Mencegah admin menghapus dirinya sendiri
    if (String(userIdToDelete) === String(currentUserId)) {
        return res.status(403).json({ msg: 'You cannot delete your own admin account via this endpoint.' });
    }

    db.beginTransaction(err => {
        if (err) {
            console.error('Transaction Start Error:', err);
            return res.status(500).json({ msg: 'Server error' });
        }
        
        // 1. Hapus entri dari wallet_members
        const deleteWalletMembersSql = 'DELETE FROM wallet_members WHERE user_id = ?';
        db.query(deleteWalletMembersSql, [userIdToDelete], (err) => {
            if (err) {
                return db.rollback(() => res.status(500).json({ msg: 'Error deleting wallet memberships.' }));
            }
            
            // 2. Hapus transaksi pengguna
            const deleteTransactionsSql = 'DELETE FROM transactions WHERE user_id = ?';
            db.query(deleteTransactionsSql, [userIdToDelete], (err) => {
                if (err) {
                    return db.rollback(() => res.status(500).json({ msg: 'Error deleting user transactions.' }));
                }

                // 3. Hapus goals pengguna
                const deleteGoalsSql = 'DELETE FROM goals WHERE user_id = ?';
                db.query(deleteGoalsSql, [userIdToDelete], (err) => {
                    if (err) {
                        return db.rollback(() => res.status(500).json({ msg: 'Error deleting user goals.' }));
                    }

                    // 4. Hapus dompet yang dimiliki pengguna (Wallet harus kosong, tetapi tidak ada pemeriksaan saldo di sini)
                    // Hati-hati: Asumsi dompet bersama yang dimiliki pengguna akan hilang.
                    const deleteOwnedWalletsSql = 'DELETE FROM wallets WHERE owner_id = ?';
                    db.query(deleteOwnedWalletsSql, [userIdToDelete], (err) => {
                        if (err) {
                            return db.rollback(() => res.status(500).json({ msg: 'Error deleting owned wallets.' }));
                        }

                        // 5. Ambil path foto profil untuk dihapus dari disk
                        const getPhotoSql = 'SELECT profile_photo_url FROM users WHERE id = ?';
                        db.query(getPhotoSql, [userIdToDelete], (err, photoResult) => {
                            if (err) {
                                return db.rollback(() => res.status(500).json({ msg: 'Error fetching profile photo path.' }));
                            }

                            const photoUrl = photoResult[0]?.profile_photo_url;
                            
                            // 6. Hapus pengguna itu sendiri
                            const deleteUserSql = 'DELETE FROM users WHERE id = ?';
                            db.query(deleteUserSql, [userIdToDelete], (err, userResult) => {
                                if (err) {
                                    return db.rollback(() => res.status(500).json({ msg: 'Error deleting user.' }));
                                }
                                if (userResult.affectedRows === 0) {
                                    return db.rollback(() => res.status(404).json({ msg: 'User not found.' }));
                                }
                                
                                // Hapus file foto dari disk jika ada
                                if (photoUrl) {
                                    const filename = path.basename(photoUrl);
                                    const filePath = path.join(__dirname, 'uploads', filename);
                                    fs.unlink(filePath, (unlinkErr) => {
                                        if (unlinkErr) {
                                            console.warn(`Could not delete profile photo file: ${filePath}. Proceeding with DB commit.`);
                                        }
                                        // Commit setelah mencoba menghapus file
                                        db.commit(commitErr => {
                                            if (commitErr) {
                                                return db.rollback(() => res.status(500).json({ msg: 'Server error: commit failed.' }));
                                            }
                                            res.json({ msg: 'User and all related data deleted successfully.' });
                                        });
                                    });
                                } else {
                                    // Commit jika tidak ada foto
                                    db.commit(commitErr => {
                                        if (commitErr) {
                                            return db.rollback(() => res.status(500).json({ msg: 'Server error: commit failed.' }));
                                        }
                                        res.json({ msg: 'User and all related data deleted successfully.' });
                                    });
                                }
                            });
                        });
                    });
                });
            });
        });
    });
});

app.get('/api/admin-users', auth, (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ msg: 'Access denied' });
    }

    const { page = 1, limit = 10, search = '' } = req.query;
    const offset = (page - 1) * limit;
    const likeSearch = `%${search}%`;

    let countSql = 'SELECT COUNT(*) as count FROM users';
    let dataSql = 'SELECT id, name, email, role, created_at, (SELECT SUM(CASE WHEN type="deposit" THEN amount ELSE -amount END) FROM transactions WHERE user_id = u.id) AS total_savings FROM users u';
    
    const countParams = [];
    const dataParams = [];

    if (search) {
        countSql += ` WHERE name LIKE ? OR email LIKE ?`;
        dataSql += ` WHERE u.name LIKE ? OR u.email LIKE ?`;
        countParams.push(likeSearch, likeSearch);
        dataParams.push(likeSearch, likeSearch);
    }

    dataSql += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    dataParams.push(parseInt(limit), parseInt(offset));

    db.query(countSql, countParams, (err, countResult) => {
        if (err) return res.status(500).json({ msg: 'Server error' });
        const totalCount = countResult[0].count;

        db.query(dataSql, dataParams, (err, dataResult) => {
            if (err) return res.status(500).json({ msg: 'Server error' });
            res.json({ users: dataResult, totalCount });
        });
    });
});

app.get('/api/admin/user/:id', auth, (req, res) => {
    const { id } = req.params;
    if (req.user.role !== 'admin') {
        return res.status(403).json({ msg: 'Access denied' });
    }

    const userSql = 'SELECT id, name, email, role, created_at, (SELECT SUM(CASE WHEN type="deposit" THEN amount ELSE -amount END) FROM transactions WHERE user_id = u.id) AS total_savings FROM users u WHERE id = ?';
    const transactionsSql = 'SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC';

    db.query(userSql, [id], (err, userResult) => {
        if (err) return res.status(500).json({ msg: 'Server error' });
        if (userResult.length === 0) {
            return res.status(404).json({ msg: 'User not found' });
        }

        const user = userResult[0];

        db.query(transactionsSql, [id], (err, transactionsResult) => {
            if (err) return res.status(500).json({ msg: 'Server error' });

            res.json({
                user: user,
                transactions: transactionsResult
            });
        });
    });
});

app.get('/api/admin-transactions', auth, (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ msg: 'Access denied' });
    }

    const { page = 1, limit = 10, search = '' } = req.query;
    const offset = (page - 1) * limit;
    const likeSearch = `%${search}%`;

    let countSql = 'SELECT COUNT(*) as count FROM transactions t JOIN users u ON t.user_id = u.id';
    let dataSql = 'SELECT t.*, u.name FROM transactions t JOIN users u ON t.user_id = u.id';

    const countParams = [];
    const dataParams = [];

    if (search) {
        countSql += ` WHERE u.name LIKE ? OR t.type LIKE ? OR t.category LIKE ? OR t.description LIKE ?`;
        dataSql += ` WHERE u.name LIKE ? OR t.type LIKE ? OR t.category LIKE ? OR t.description LIKE ?`;
        countParams.push(likeSearch, likeSearch, likeSearch, likeSearch);
        dataParams.push(likeSearch, likeSearch, likeSearch, likeSearch);
    }

    dataSql += ` ORDER BY t.created_at DESC LIMIT ? OFFSET ?`;
    dataParams.push(parseInt(limit), parseInt(offset));

    db.query(countSql, countParams, (err, countResult) => {
        if (err) return res.status(500).json({ msg: 'Server error' });
        const totalCount = countResult[0].count;

        db.query(dataSql, dataParams, (err, dataResult) => {
            if (err) return res.status(500).json({ msg: 'Server error' });
            res.json({ transactions: dataResult, totalCount });
        });
    });
});

app.get('/api/profile', auth, (req, res) => {
    const { id } = req.user;
    const sql = 'SELECT name, email, created_at, profile_photo_url FROM users WHERE id = ?';
    db.query(sql, [id], (err, result) => {
        if (err) return res.status(500).json({ msg: 'Server error' });
        if (result.length === 0) return res.status(404).json({ msg: 'User not found' });
        res.json(result[0]);
    });
});

app.post('/api/profile/photo', auth, upload.single('profile_photo'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ msg: 'No file uploaded.' });
    }

    const profilePhotoUrl = `http://localhost:${port}/uploads/${req.file.filename}`;
    const sql = 'UPDATE users SET profile_photo_url = ? WHERE id = ?';
    db.query(sql, [profilePhotoUrl, req.user.id], (err, result) => {
        if (err) {
            console.error(err);
            fs.unlinkSync(req.file.path);
            return res.status(500).json({ msg: 'Server error. Failed to save photo URL.' });
        }
        res.json({ msg: 'Profile photo updated successfully.', profilePhotoUrl });
    });
});

app.delete('/api/profile/photo', auth, (req, res) => {
    const { id: userId } = req.user;
    const sql = 'SELECT profile_photo_url FROM users WHERE id = ?';
    
    db.query(sql, [userId], (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ msg: 'Server error.' });
        }
        if (results.length === 0 || !results[0].profile_photo_url) {
            return res.status(404).json({ msg: 'No profile photo to delete.' });
        }
        
        const fileUrl = results[0].profile_photo_url;
        const filename = path.basename(fileUrl);
        const filePath = path.join(__dirname, 'uploads', filename);
        fs.unlink(filePath, (err) => {
            if (err) {
                console.error('Failed to delete file from disk:', err);
            }
            
            const updateSql = 'UPDATE users SET profile_photo_url = NULL WHERE id = ?';
            db.query(updateSql, [userId], (err, updateResult) => {
                if (err) {
                    console.error(err);
                    return res.status(500).json({ msg: 'Server error: Failed to remove photo URL from database.' });
                }
                res.json({ msg: 'Profile photo deleted successfully.' });
            });
        });
    });
});

// @route   PUT api/profile
// @desc    Update user profile (e.g., name)
// @access  Private
app.put('/api/profile', auth, async (req, res) => {
    const { id: userId } = req.user;
    const { name } = req.body; 

    if (!name || typeof name !== 'string' || name.trim().length < 3) {
        return res.status(400).json({ msg: 'Name is required and must be at least 3 characters.' });
    }

    try {
        const updateSql = 'UPDATE users SET name = ? WHERE id = ?';

        db.query(updateSql, [name, userId], (err, result) => {
            if (err) {
                console.error('MySQL Update Error:', err);
                return res.status(500).json({ msg: 'Server error: Failed to update name.' });
            }
            
            const fetchSql = 'SELECT name, email, created_at, profile_photo_url FROM users WHERE id = ?';
            db.query(fetchSql, [userId], (err, fetchResult) => {
                if (err) {
                    console.error('MySQL Fetch Error:', err);
                    return res.status(500).json({ msg: 'Server error: Failed to fetch updated profile.' });
                }
                
                if (fetchResult.length === 0) {
                     return res.status(404).json({ msg: 'User not found after update.' });
                }

                res.json(fetchResult[0]);
            });
        });

    } catch (err) {
        console.error('Server Error:', err.message);
        res.status(500).json({ msg: 'Server error' });
    }
});


// =======================================================
// MODIFIKASI INI: Endpoint Settings (HANYA Dark Mode)
// =======================================================

app.get('/api/settings', auth, (req, res) => {
    const { id } = req.user;
    // HANYA SELECT kolom yang pasti ada di database Anda
    const sql = 'SELECT dark_mode FROM users WHERE id = ?'; 
    db.query(sql, [id], (err, result) => {
        if (err) {
            // Log error SQL di konsol server
            console.error("SQL Error fetching settings:", err); 
            return res.status(500).json({ msg: 'Server error' });
        }
        if (result.length === 0) return res.status(404).json({ msg: 'User not found' });
        res.json(result[0]); 
    });
});

app.post('/api/update-setting', auth, (req, res) => {
    const { id } = req.user;
    const { settingName, value } = req.body;
    
    // HANYA izinkan settingName yang pasti ada di DB
    if (!['dark_mode'].includes(settingName)) {
        return res.status(400).json({ msg: 'Invalid setting name' });
    }
    
    const sql = `UPDATE users SET ?? = ? WHERE id = ?`;
    db.query(sql, [settingName, value, id], (err, result) => {
        if (err) {
            console.error("SQL Error updating setting:", err);
            return res.status(500).json({ msg: 'Server error' });
        }
        res.json({ msg: 'Setting updated successfully' });
    });
});

// =======================================================
// AKHIR MODIFIKASI
// =======================================================


app.post('/api/change-password', auth, async (req, res) => {
    const { id } = req.user;
    const { currentPassword, newPassword } = req.body;

    try {
        const sql = 'SELECT password FROM users WHERE id = ?';
        db.query(sql, [id], async (err, results) => {
            if (err) return res.status(500).json({ msg: 'Server error' });
            if (results.length === 0) return res.status(404).json({ msg: 'User not found' });

            const user = results[0];
            const isMatch = await bcrypt.compare(currentPassword, user.password);

            if (!isMatch) {
                return res.status(400).json({ msg: 'Invalid current password' });
            }

            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(newPassword, salt);

            const updateSql = 'UPDATE users SET password = ? WHERE id = ?';
            db.query(updateSql, [hashedPassword, id], (err, updateResult) => {
                if (err) return res.status(500).json({ msg: 'Server error' });
                res.json({ msg: 'Password changed successfully' });
            });
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server error' });
    }
});

app.post('/api/add-goal', auth, (req, res) => {
    const { id } = req.user;
    const { name, target_amount } = req.body;

    if (req.user.role !== 'user') {
        return res.status(403).json({ msg: 'Access denied' });
    }
    
    if (!name || !target_amount) {
        return res.status(400).json({ msg: 'Please provide goal name and target amount.' });
    }

    const newGoal = {
        user_id: id,
        name,
        target_amount: parseFloat(target_amount),
        current_amount: 0
    };

    const sql = 'INSERT INTO goals SET ?';
    db.query(sql, newGoal, (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ msg: 'Server error' });
        }
        res.status(201).json({ msg: 'Goal added successfully!' });
    });
});

app.get('/api/goal/:id', auth, (req, res) => {
    const { id: goalId } = req.params;
    const { id: userId, role } = req.user;

    if (role !== 'user') {
        return res.status(403).json({ msg: 'Access denied' });
    }

    const sqlGoal = 'SELECT * FROM goals WHERE id = ? AND user_id = ?';
    const sqlTransactions = 'SELECT * FROM transactions WHERE user_id = ? AND category = "Savings" ORDER BY created_at DESC';

    db.query(sqlGoal, [goalId, userId], (err, goalResult) => {
        if (err) return res.status(500).json({ msg: 'Server error' });
        if (goalResult.length === 0) return res.status(404).json({ msg: 'Goal not found' });
        
        const goalData = goalResult[0];

        db.query(sqlTransactions, [userId], (err, transactionsResult) => {
            if (err) return res.status(500).json({ msg: 'Server error' });

            const filteredTransactions = transactionsResult.filter(t => t.description.includes(goalData.name));
            
            res.json({
                goal: goalData,
                transactions: filteredTransactions
            });
        });
    });
});

app.delete('/api/goal/:id', auth, (req, res) => {
    const { id: goalId } = req.params;
    const { id: userId, role } = req.user;

    if (role !== 'user') {
        return res.status(403).json({ msg: 'Access denied' });
    }

    const checkGoalSql = 'SELECT current_amount FROM goals WHERE id = ? AND user_id = ?';
    db.query(checkGoalSql, [goalId, userId], (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ msg: 'Server error' });
        }
        if (result.length === 0) {
            return res.status(404).json({ msg: 'Goal not found or you do not have permission to delete it.' });
        }
        
        const currentAmount = result[0].current_amount;
        if (currentAmount > 0) {
            return res.status(400).json({ msg: 'Cannot delete a goal with a non-zero balance. Please withdraw all funds first.' });
        }

        const deleteSql = 'DELETE FROM goals WHERE id = ? AND user_id = ?';
        db.query(deleteSql, [goalId, userId], (err, deleteResult) => {
            if (err) {
                console.error(err);
                return res.status(500).json({ msg: 'Server error' });
            }
            if (deleteResult.affectedRows === 0) {
                return res.status(404).json({ msg: 'Goal not found or you do not have permission to delete it.' });
            }
            res.json({ msg: 'Goal deleted successfully.' });
        });
    });
});

app.post('/api/goal/deposit', auth, (req, res) => {
    const { id: userId } = req.user;
    const { goalId, amount } = req.body;
    const depositAmount = parseFloat(amount);

    if (req.user.role !== 'user') {
        return res.status(403).json({ msg: 'Access denied' });
    }

    if (isNaN(depositAmount) || depositAmount <= 0) {
        return res.status(400).json({ msg: 'Invalid amount.' });
    }
    
    const getGoalInfoSql = 'SELECT name, current_amount, target_amount FROM goals WHERE id = ? AND user_id = ?';
    db.query(getGoalInfoSql, [goalId, userId], (err, goalResults) => {
        if (err || goalResults.length === 0) {
            return res.status(500).json({ msg: 'Goal not found or server error.' });
        }
        
        const goal = goalResults[0];
        const goalName = goal.name;
        const currentAmount = goal.current_amount;
        const targetAmount = goal.target_amount;

        if (currentAmount + depositAmount > targetAmount) {
            return res.status(400).json({ msg: 'Deposit amount will exceed the goal target. Please deposit a smaller amount.' });
        }

        const updateGoalSql = 'UPDATE goals SET current_amount = current_amount + ? WHERE id = ? AND user_id = ?';
        db.query(updateGoalSql, [depositAmount, goalId, userId], (err) => {
            if (err) {
                return res.status(500).json({ msg: 'Error updating goal' });
            }

            const transactionSql = 'INSERT INTO transactions (user_id, type, amount, description, category) VALUES (?, ?, ?, ?, ?)';
            db.query(transactionSql, [userId, 'deposit', depositAmount, `Deposit to ${goalName}`, 'Savings'], (err) => {
                if (err) {
                    return res.status(500).json({ msg: 'Error adding transaction' });
                }

                res.json({ msg: 'Deposit successfull!' });
            });
        });
    });
});

app.post('/api/goal/withdraw', auth, (req, res) => {
    const { id: userId } = req.user;
    const { goalId, amount } = req.body;
    const withdrawAmount = parseFloat(amount);

    if (req.user.role !== 'user') {
        return res.status(403).json({ msg: 'Access denied' });
    }

    if (isNaN(withdrawAmount) || withdrawAmount <= 0) {
        return res.status(400).json({ msg: 'Invalid amount.' });
    }
    
    const getGoalNameSql = 'SELECT name FROM goals WHERE id = ? AND user_id = ?';
    db.query(getGoalNameSql, [goalId, userId], (err, nameResult) => {
        if (err || nameResult.length === 0) {
            return res.status(500).json({ msg: 'Goal not found or server error.' });
        }
        const goalName = nameResult[0].name;

        const checkFundsSql = 'SELECT current_amount FROM goals WHERE id = ? AND user_id = ?';
        db.query(checkFundsSql, [goalId, userId], (err, checkResults) => {
            if (err || checkResults.length === 0) {
                return res.status(500).json({ msg: 'Goal not found or server error.' });
            }
            
            const currentAmount = checkResults[0].current_amount;
            if (currentAmount < withdrawAmount) {
                return res.status(400).json({ msg: 'Insufficient funds in goal.' });
            }

            const updateGoalSql = 'UPDATE goals SET current_amount = current_amount - ? WHERE id = ? AND user_id = ?';
            db.query(updateGoalSql, [withdrawAmount, goalId, userId], (err) => {
                if (err) {
                    return res.status(500).json({ msg: 'Error updating goal' });
                }

                const transactionSql = 'INSERT INTO transactions (user_id, type, amount, description, category) VALUES (?, ?, ?, ?, ?)';
                db.query(transactionSql, [userId, 'withdrawal', withdrawAmount, `Withdrawal from ${goalName}`, 'Savings'], (err) => {
                    if (err) {
                        return res.status(500).json({ msg: 'Error adding transaction' });
                    }

                    res.json({ msg: 'Withdrawal successfull!' });
                });
            });
        });
    });
});

app.post('/api/wallets', auth, (req, res) => {
    const { id: userId } = req.user;
    const { name } = req.body;
    
    if (!name) {
        return res.status(400).json({ msg: 'Wallet name is required.' });
    }

    db.beginTransaction(err => {
        if (err) { return res.status(500).json({ msg: 'Server error' }); }

        const createWalletSql = 'INSERT INTO wallets (owner_id, name, balance) VALUES (?, ?, ?)';
        db.query(createWalletSql, [userId, name, 0], (err, walletResult) => {
            if (err) {
                return db.rollback(() => res.status(500).json({ msg: 'Server error: failed to create wallet.' }));
            }
            const walletId = walletResult.insertId;
            
            const addMemberSql = 'INSERT INTO wallet_members (wallet_id, user_id, role) VALUES (?, ?, ?)';
            db.query(addMemberSql, [walletId, userId, 'owner'], (err, memberResult) => {
                if (err) {
                    return db.rollback(() => res.status(500).json({ msg: 'Server error: failed to add wallet owner as member.' }));
                }

                db.commit(err => {
                    if (err) {
                        return db.rollback(() => res.status(500).json({ msg: 'Server error: commit failed.' }));
                    }
                    res.status(201).json({ msg: 'Wallet created successfully!' });
                });
            });
        });
    });
});

app.get('/api/wallets', auth, (req, res) => {
    const { id: userId } = req.user;
    const sql = `
        SELECT w.id, w.name, w.balance, w.owner_id
        FROM wallets w
        JOIN wallet_members wm ON w.id = wm.wallet_id
        WHERE wm.user_id = ?
        ORDER BY w.created_at DESC
    `;
    db.query(sql, [userId], (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ msg: 'Server error' });
        }
        res.json(results);
    });
});

app.post('/api/wallets/:walletId/share', auth, (req, res) => {
    const { email } = req.body;
    const walletId = req.params.walletId;
    const currentUserId = req.user.id;

    const checkOwnerSql = 'SELECT id FROM wallets WHERE id = ? AND owner_id = ?';
    db.query(checkOwnerSql, [walletId, currentUserId], (err, walletResult) => {
        if (err) {
            console.error('Error checking wallet ownership:', err);
            return res.status(500).json({ msg: 'Server error.' });
        }
        if (walletResult.length === 0) {
            return res.status(403).json({ msg: 'You do not have permission to share this wallet.' });
        }

        const findUserSql = 'SELECT id FROM users WHERE email = ?';
        db.query(findUserSql, [email], (err, userResult) => {
            if (err) {
                console.error('Error finding user:', err);
                return res.status(500).json({ msg: 'Server error.' });
            }
            if (userResult.length === 0) {
                return res.status(404).json({ msg: 'User with that email not found.' });
            }

            const userToShareId = userResult[0].id;

            const shareWalletSql = 'INSERT INTO wallet_members (wallet_id, user_id, role) VALUES (?, ?, ?)';
            db.query(shareWalletSql, [walletId, userToShareId, 'member'], (err, shareResult) => {
                if (err) {
                    if (err.code === 'ER_DUP_ENTRY') {
                        return res.status(400).json({ msg: 'Wallet is already shared with this user.' });
                    }
                    console.error('Error sharing wallet:', err);
                    return res.status(500).json({ msg: 'Server error.' });
                }
                res.status(200).json({ msg: 'Wallet shared successfully!' });
            });
        });
    });
});

app.delete('/api/transaction/:id', auth, (req, res) => {
    const { id: transactionId } = req.params;
    const { id: userId, role } = req.user;

    if (role !== 'user') {
        return res.status(403).json({ msg: 'Access denied' });
    }

    const sql = 'DELETE FROM transactions WHERE id = ? AND user_id = ?';
    db.query(sql, [transactionId, userId], (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ msg: 'Server error' });
        }
        if (result.affectedRows === 0) {
            return res.status(404).json({ msg: 'Transaction not found or you do not have permission to delete it.' });
        }
        res.json({ msg: 'Transaction deleted successfully!' });
    });
});

app.post('/api/transaction', auth, async (req, res) => {
    const { id: userId, role } = req.user;
    const { type, amount, sourceWalletId, destinationWalletId, description } = req.body;
    const transactionAmount = parseFloat(amount);

    if (role !== 'user') {
        return res.status(403).json({ msg: 'Access denied' });
    }

    if (!type || !amount) {
        return res.status(400).json({ msg: 'Missing required fields.' });
    }

    if (isNaN(transactionAmount) || transactionAmount <= 0) {
        return res.status(400).json({ msg: 'Invalid amount.' });
    }

    const checkMembershipSql = 'SELECT user_id FROM wallet_members WHERE wallet_id = ? AND user_id = ?';
    db.query(checkMembershipSql, [sourceWalletId, userId], (err, results) => {
        if (err) return res.status(500).json({ msg: 'Server error.' });
        if (results.length === 0) {
            return res.status(403).json({ msg: 'You do not have access to this wallet.' });
        }

        if (type === 'deposit') {
            const sql = 'UPDATE wallets SET balance = balance + ? WHERE id = ?';
            db.query(sql, [transactionAmount, sourceWalletId], (err) => {
                if (err) {
                    return res.status(500).json({ msg: 'Server error: failed to update wallet balance.' });
                }
                const transactionSql = 'INSERT INTO transactions (user_id, wallet_id, type, amount, description, category) VALUES (?, ?, ?, ?, ?, ?)';
                db.query(transactionSql, [userId, sourceWalletId, type, transactionAmount, description, 'General'], (err) => {
                    if (err) return res.status(500).json({ msg: 'Error adding transaction' });
                    res.json({ msg: 'Deposit successful!' });
                });
            });
        } else if (type === 'withdrawal') {
            const checkBalanceSql = 'SELECT balance FROM wallets WHERE id = ?';
            db.query(checkBalanceSql, [sourceWalletId], (err, balanceResults) => {
                if (err || balanceResults.length === 0) {
                    return res.status(500).json({ msg: 'Wallet not found or server error.' });
                }
                const currentBalance = balanceResults[0].balance;
                if (currentBalance < transactionAmount) {
                    return res.status(400).json({ msg: 'Insufficient funds in the wallet.' });
                }

                const sql = 'UPDATE wallets SET balance = balance - ? WHERE id = ?';
                db.query(sql, [transactionAmount, sourceWalletId], (err) => {
                    if (err) {
                        return res.status(500).json({ msg: 'Server error: failed to update wallet balance.' });
                    }
                    const transactionSql = 'INSERT INTO transactions (user_id, wallet_id, type, amount, description, category) VALUES (?, ?, ?, ?, ?, ?)';
                    db.query(transactionSql, [userId, sourceWalletId, type, transactionAmount, description, 'General'], (err) => {
                        if (err) return res.status(500).json({ msg: 'Error adding transaction' });
                        res.json({ msg: 'Withdrawal successful!' });
                    });
                });
            });
        } else if (type === 'transfer') {
            if (sourceWalletId === destinationWalletId) {
                return res.status(400).json({ msg: 'Source and destination wallets cannot be the same.' });
            }

            db.query(checkMembershipSql, [destinationWalletId, userId], (err, destResults) => {
                if (err) return res.status(500).json({ msg: 'Server error.' });
                if (destResults.length === 0) {
                    return res.status(403).json({ msg: 'You do not have access to the destination wallet.' });
                }

                db.beginTransaction(err => {
                    if (err) { return res.status(500).json({ msg: 'Server error.' }); }

                    const updateSourceSql = 'UPDATE wallets SET balance = balance - ? WHERE id = ?';
                    db.query(updateSourceSql, [transactionAmount, sourceWalletId], (err, result) => {
                        if (err) {
                            return db.rollback(() => res.status(500).json({ msg: 'Error updating source wallet.' }));
                        }

                        const updateDestinationSql = 'UPDATE wallets SET balance = balance + ? WHERE id = ?';
                        db.query(updateDestinationSql, [transactionAmount, destinationWalletId], (err, result) => {
                            if (err) {
                                return db.rollback(() => res.status(500).json({ msg: 'Error updating destination wallet.' }));
                            }

                            const transactionSql = 'INSERT INTO transactions (user_id, wallet_id, type, amount, description, category) VALUES (?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?)';
                            const withdrawalData = [userId, sourceWalletId, 'withdrawal', transactionAmount, `Transfer to wallet ${destinationWalletId}`, 'Transfer'];
                            const depositData = [userId, destinationWalletId, 'deposit', transactionAmount, `Transfer from wallet ${sourceWalletId}`, 'Transfer'];
                            
                            db.query(transactionSql, [...withdrawalData, ...depositData], (err) => {
                                if (err) {
                                    return db.rollback(() => res.status(500).json({ msg: 'Error logging transfer transactions.' }));
                                }
                                db.commit(err => {
                                    if (err) {
                                        return db.rollback(() => res.status(500).json({ msg: 'Error committing transfer.' }));
                                    }
                                    res.json({ msg: 'Transfer successful!' });
                                });
                            });
                        });
                    });
                });
            });
        } else {
            res.status(400).json({ msg: 'Invalid transaction type.' });
        }
    });
});

app.get('/api/transactions/filter', auth, (req, res) => {
    const { id: userId, role } = req.user;
    const { timeframe, walletId } = req.query;

    if (role !== 'user') {
        return res.status(403).json({ msg: 'Access denied' });
    }

    if (!walletId) {
        return res.status(400).json({ msg: 'walletId is required.' });
    }

    let dateFilter;
    const now = new Date();

    if (timeframe === 'weekly') {
        now.setDate(now.getDate() - 7);
    } else if (timeframe === 'monthly') {
        now.setMonth(now.getMonth() - 1);
    } else if (timeframe === 'yearly') {
        now.setFullYear(now.getFullYear() - 1);
    } else {
        now.setMonth(now.getMonth() - 1);
    }
    dateFilter = now.toISOString().slice(0, 10);

    const filteredSql = `
        SELECT id, type, amount, created_at FROM transactions 
        WHERE user_id = ? AND wallet_id = ? AND created_at >= ? 
        ORDER BY created_at ASC
    `;
    const allSql = `
        SELECT id, type, amount, created_at FROM transactions 
        WHERE user_id = ? AND wallet_id = ? 
        ORDER BY created_at ASC
    `;

    db.query(filteredSql, [userId, walletId, dateFilter], (err, results) => {
        if (err) {
            console.error(err.message);
            return res.status(500).json({ msg: 'Server error' });
        }

        if (results.length > 0) {
            return res.json(results);
        }

        db.query(allSql, [userId, walletId], (err, allResults) => {
            if (err) {
                console.error(err.message);
                return res.status(500).json({ msg: 'Server error' });
            }
            res.json(allResults);
        });
    });
});

app.delete('/api/wallets/:id', auth, (req, res) => {
    const { id: walletId } = req.params;
    const { id: userId } = req.user;

    db.beginTransaction(err => {
        if (err) {
            return res.status(500).json({ msg: 'Server error' });
        }

        const checkOwnerSql = 'SELECT owner_id, balance FROM wallets WHERE id = ?';
        db.query(checkOwnerSql, [walletId], (err, results) => {
            if (err) {
                return db.rollback(() => res.status(500).json({ msg: 'Server error' }));
            }
            if (results.length === 0) {
                return db.rollback(() => res.status(404).json({ msg: 'Wallet not found' }));
            }
            if (results[0].owner_id !== userId) {
                return db.rollback(() => res.status(403).json({ msg: 'Not authorized to delete this wallet' }));
            }
            
            if (results[0].balance > 0) {
                return db.rollback(() => res.status(400).json({ msg: 'Cannot delete wallet with a non-zero balance. Please withdraw all funds first.' }));
            }

            const deleteTransactionsSql = 'DELETE FROM transactions WHERE wallet_id = ?';
            db.query(deleteTransactionsSql, [walletId], (err, transResult) => {
                if (err) {
                    return db.rollback(() => res.status(500).json({ msg: 'Server error: failed to delete transactions.' }));
                }

                const deleteWalletSql = 'DELETE FROM wallets WHERE id = ?';
                db.query(deleteWalletSql, [walletId], (err, walletResult) => {
                    if (err) {
                        return db.rollback(() => res.status(500).json({ msg: 'Server error: failed to delete wallet.' }));
                    }

                    db.commit(err => {
                        if (err) {
                            return db.rollback(() => res.status(500).json({ msg: 'Server error: commit failed.' }));
                        }
                        res.json({ msg: 'Wallet deleted successfully!' });
                    });
                });
            });
        });
    });
});


app.get('/api/transactions/wallet/:walletId', auth, (req, res) => {
    const { id: userId } = req.user;
    const { walletId } = req.params;

    const sql = `
        SELECT id, type, amount, created_at FROM transactions 
        WHERE user_id = ? AND wallet_id = ? 
        ORDER BY created_at ASC
    `;

    db.query(sql, [userId, walletId], (err, transactions) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ msg: 'Server error fetching wallet transactions.' });
        }

        let runningBalance = 0;
        const chartData = transactions.map(trans => {
            const amount = parseFloat(trans.amount);
            if (trans.type === 'deposit') {
                runningBalance += amount;
            } else {
                runningBalance -= amount;
            }
            return {
                date: trans.created_at,
                balance: runningBalance
            };
        });

        res.json(chartData);
    });
});

app.delete('/api/admin/user/:id', auth, (req, res) => {
    // 1. Admin check
    if (req.user.role !== 'admin') {
        return res.status(403).json({ msg: 'Access denied: Only admins can delete users.' });
    }

    const { id: userIdToDelete } = req.params;

    // 2. Start Database Transaction
    db.beginTransaction(err => {
        if (err) {
            console.error(err);
            return res.status(500).json({ msg: 'Server error: Failed to start transaction.' });
        }

        // --- Step 1: Delete Related Transactions ---
        const deleteTransactionsSql = 'DELETE FROM transactions WHERE user_id = ?';
        db.query(deleteTransactionsSql, [userIdToDelete], (err, result) => {
            if (err) {
                return db.rollback(() => res.status(500).json({ msg: 'Server error: Failed to delete user transactions.' }));
            }

            // --- Step 2: Delete Related Wallets ---
            const deleteWalletsSql = 'DELETE FROM wallets WHERE user_id = ?';
            db.query(deleteWalletsSql, [userIdToDelete], (err, result) => {
                if (err) {
                    return db.rollback(() => res.status(500).json({ msg: 'Server error: Failed to delete user wallets.' }));
                }

                // --- Step 3: Delete Primary User Account ---
                const deleteUserSql = 'DELETE FROM users WHERE id = ?';
                db.query(deleteUserSql, [userIdToDelete], (err, result) => {
                    if (err) {
                        return db.rollback(() => res.status(500).json({ msg: 'Server error: Failed to delete user account.' }));
                    }
                    if (result.affectedRows === 0) {
                        return db.rollback(() => res.status(404).json({ msg: 'User not found.' }));
                    }

                    // --- Step 4: Commit Transaction ---
                    db.commit(err => {
                        if (err) {
                            return db.rollback(() => res.status(500).json({ msg: 'Server error: Commit failed.' }));
                        }
                        res.json({ msg: 'User and all related data successfully deleted.' });
                    });
                });
            });
        });
    });
});

// @route   PUT api/admin/user/:id
// @desc    Admin update user details (name, email)
// @access  Private (Admin only)
app.put('/api/admin/user/:id', auth, (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ msg: 'Access denied: Only admins can modify details.' });
    }

    const { id } = req.params;
    const { name, email } = req.body;

    if (!name || !email) {
        return res.status(400).json({ msg: 'Name and email are required.' });
    }

    // 1. Check if the new email is already in use by another user
    const checkEmailSql = 'SELECT id FROM users WHERE email = ? AND id != ?';
    db.query(checkEmailSql, [email, id], (err, results) => {
        if (err) {
            console.error('SQL Error during email check:', err);
            return res.status(500).json({ msg: 'Server error checking email availability.' });
        }
        
        if (results.length > 0) {
            return res.status(400).json({ msg: 'Update failed: This email is already used by another user.' });
        }

        // 2. Perform the user details update
        const updateSql = 'UPDATE users SET name = ?, email = ? WHERE id = ?';
        db.query(updateSql, [name, email, id], (err, result) => {
            if (err) {
                console.error('SQL Error during details update:', err);
                return res.status(500).json({ msg: 'Server error: Failed to update user details.' });
            }
            if (result.affectedRows === 0) {
                return res.status(404).json({ msg: 'The user to be updated was not found.' });
            }
            
            // 3. Send success response
            res.json({ 
                msg: 'User details updated successfully.', 
                user: { id: id, name: name, email: email } 
            });
        });
    });
});

// @route   PUT api/admin/user/:id
// @desc    Admin update user details (name, email)
// @access  Private (Admin only)
app.put('/api/admin/user/:id', auth, (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ msg: 'Access denied: Only admins can modify details.' });
    }

    const { id } = req.params;
    const { name, email } = req.body;

    if (!name || !email) {
        return res.status(400).json({ msg: 'Name and email are required.' });
    }

    // 1. Check if the new email is already in use by another user
    const checkEmailSql = 'SELECT id FROM users WHERE email = ? AND id != ?';
    db.query(checkEmailSql, [email, id], (err, results) => {
        if (err) {
            console.error('SQL Error during email check:', err);
            return res.status(500).json({ msg: 'Server error checking email availability.' });
        }
        
        if (results.length > 0) {
            return res.status(400).json({ msg: 'Update failed: This email is already used by another user.' });
        }

        // 2. Perform the user details update
        const updateSql = 'UPDATE users SET name = ?, email = ? WHERE id = ?';
        db.query(updateSql, [name, email, id], (err, result) => {
            if (err) {
                console.error('SQL Error during details update:', err);
                return res.status(500).json({ msg: 'Server error: Failed to update user details.' });
            }
            if (result.affectedRows === 0) {
                return res.status(404).json({ msg: 'The user to be updated was not found.' });
            }
            
            // 3. Send success response
            res.json({ 
                msg: 'User details updated successfully.', 
                user: { id: id, name: name, email: email } 
            });
        });
    });
});

app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});