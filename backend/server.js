// ============================================
// IMPORTS - Load all required libraries
// ============================================

require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const QRCode = require('qrcode');
const crypto = require('crypto');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const connectDB = require('./config/db');
const User = require('./models/User');
const Group = require('./models/Group');
const Message = require('./models/Message');

// ============================================
// SERVER SETUP
// ============================================

const app = express();
const server = http.createServer(app);

const allowedOrigins = [
  process.env.FRONTEND_URL,
  "http://localhost:3000",
  "http://192.168.1.112:3000"
].filter(Boolean);

const io = new Server(server, {
  cors: {
    origin: allowedOrigins.length ? allowedOrigins : true,
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ["websocket", "polling"]
});

app.set('io', io);   // ✅ expose io to app (future-proof)
global.io = io;      // ✅ optional but useful

app.get("/health", (req, res) => {
  res.status(200).send("OK");
});

// ============================================
// MIDDLEWARE
// ============================================

app.use

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ============================================
// FILE UPLOAD SETUP (Multer)
// ============================================

const uploadsDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads')));

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    const name = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9]/g, '_');
    cb(null, `${name}-${uniqueSuffix}${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|mp4|mov|avi|pdf|doc|docx|txt/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);
  
  if (extname && mimetype) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only images, videos, and documents allowed.'));
  }
};

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: fileFilter
});

// ============================================
// CONNECT TO DATABASE
// ============================================

connectDB();

// ============================================
// HELPER FUNCTIONS
// ============================================

const generatePIN = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

const generateToken = (userId) => {
  return jwt.sign(
    { userId },
    process.env.JWT_SECRET,
    { expiresIn: '30d' }
  );
};

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch (error) {
    res.status(403).json({ error: 'Invalid or expired token.' });
  }
};

const optionalAuth = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.userId = decoded.userId;
    } catch (error) {
      console.log('Optional auth: Invalid token, proceeding without auth');
    }
  }
  
  next();
};

// ============================================
// REST API ROUTES
// ============================================

app.get('/', (req, res) => {
  res.json({ message: 'Chat App Server is Running! 🚀' });
});

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date(),
    uptime: process.uptime()
  });
});

// ------------------
// AUTH ROUTES
// ------------------

app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, email, password, name, role } = req.body;

    const finalUsername = username || (email ? email.split('@')[0] : null);
    const finalEmail = email || username;

    if (!finalUsername || !password) {
      return res.status(400).json({ error: 'Email/username and password are required' });
    }
    
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    
    const existingUser = await User.findOne({
      $or: [
        { username: finalUsername },
        { email: finalEmail }
      ]
    });
    
    if (existingUser) {
      return res.status(400).json({ error: 'Username or email already taken' });
    }
    
    const user = new User({
      username: finalUsername,
      email: finalEmail,
      password,
      name: name || finalUsername,
      role: role || 'student'
    });
    
    await user.save();
    
    const token = generateToken(user._id);
    
    res.status(201).json({
      message: 'User registered successfully',
      token,
      user: {
        id: user._id.toString(),
        username: user.username,
        email: user.email,
        name: user.name,
        role: user.role
      }
    });
    
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Server error during registration' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    
    if ((!username && !email) || !password) {
      return res.status(400).json({ error: 'Email/username and password are required' });
    }
    
    const loginIdentifier = email || username;
    
    const user = await User.findOne({
      $or: [
        { username: loginIdentifier },
        { email: loginIdentifier }
      ]
    });
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const token = generateToken(user._id);
    
    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user._id.toString(),
        username: user.username,
        email: user.email,
        name: user.name,
        role: user.role
      }
    });
    
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error during login' });
  }
});

// ------------------
// FILE UPLOAD ROUTE
// ------------------

app.post('/api/upload', authenticateToken, upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const fileUrl = `/uploads/${req.file.filename}`;
    
    res.json({
      success: true,
      file: {
        url: fileUrl,
        name: req.file.originalname,
        size: req.file.size,
        type: req.file.mimetype
      }
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'File upload failed' });
  }
});

app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large. Maximum size is 10MB.' });
    }
    return res.status(400).json({ error: error.message });
  } else if (error) {
    return res.status(400).json({ error: error.message });
  }
  next();
});

// ------------------
// GROUP ROUTES
// ------------------

app.post('/api/groups/create', authenticateToken, async (req, res) => {
  try {
    const { groupName } = req.body;
    
    if (!groupName) {
      return res.status(400).json({ error: 'Group name is required' });
    }
    
    let pin;
    let pinExists = true;
    while (pinExists) {
      pin = generatePIN();
      pinExists = await Group.findOne({ pin });
    }
    
    const joinUrl = `${process.env.FRONTEND_URL}?pin=${pin}`;
    const qrCode = await QRCode.toDataURL(joinUrl);
    
    const group = new Group({
      groupName,
      admin: req.userId,
      members: [{
        user: req.userId,
        joinedAt: new Date()
      }],
      pin,
      qrCode,
      onlineUsers: []
    });
    
    await group.save();
    await group.populate('admin', 'username name');
    
    console.log('✅ Group created:', { groupName, pin, admin: req.userId });
    
    res.status(201).json({
      message: 'Group created successfully',
      group: {
        id: group._id,
        groupName: group.groupName,
        pin: group.pin,
        qrCode: group.qrCode,
        admin: group.admin,
        createdAt: group.createdAt
      }
    });
    
  } catch (error) {
    console.error('Create group error:', error);
    res.status(500).json({ error: 'Server error creating group' });
  }
});

// ✅ FIX 2: JOIN GROUP ROUTE - Enhanced logging and PIN sanitization
app.post('/api/groups/join', optionalAuth, async (req, res) => {
  try {
    const { pin, name, email } = req.body;
    
    // ✅ LOG 1: Incoming request
    console.log('📥 Join request received:', { 
      pin: pin ? `${pin.substring(0, 2)}****` : 'MISSING',
      name: name || 'N/A', 
      email: email ? email.substring(0, 3) + '***' : 'N/A',
      hasAuth: !!req.userId,
      userId: req.userId || 'guest'
    });
    
    // ✅ VALIDATE PIN EXISTS
    if (!pin) {
      console.log('❌ Join failed: PIN missing');
      return res.status(400).json({ error: 'PIN is required' });
    }
    
    // ✅ CLEAN PIN (remove spaces, trim, convert to string)
    const cleanPin = String(pin).trim().replace(/\s+/g, '');
    
    console.log('🧹 Cleaned PIN:', cleanPin, `(original: "${pin}")`);
    
    // ✅ VALIDATE PIN FORMAT
    if (!/^\d{6}$/.test(cleanPin)) {
      console.log('❌ Join failed: Invalid PIN format');
      console.log('   Expected: 6 digits, Got:', cleanPin);
      return res.status(400).json({ 
        error: 'PIN must be exactly 6 digits',
        received: cleanPin.length + ' characters' 
      });
    }
    
    console.log('🔍 Searching for group with PIN:', cleanPin);
    
    // ✅ FIND GROUP
    const group = await Group.findOne({ pin: cleanPin, isActive: true });
    
    if (!group) {
      console.log('❌ Join failed: Group not found or inactive');
      console.log('   Searched PIN:', cleanPin);
      
      // Check if group exists but is inactive
      const inactiveGroup = await Group.findOne({ pin: cleanPin, isActive: false });
      if (inactiveGroup) {
        console.log('   Found inactive group:', inactiveGroup.groupName);
        return res.status(404).json({ error: 'This session has ended' });
      }
      
      return res.status(404).json({ error: 'Invalid PIN or session not found' });
    }
    
    console.log('✅ Group found:', group.groupName, '(ID:', group._id + ')');
    
    // ============================================
    // AUTHENTICATED USER JOIN
    // ============================================
    if (req.userId) {
      console.log('👤 Authenticated join for user:', req.userId);
      
      // Check if already a member
      if (group.isMember(req.userId)) {
        console.log('✅ User already a member');
        
        await group.populate('admin', 'username name');
        await group.populate('members.user', 'username name isOnline');
        
        return res.json({
          message: 'Already a member',
          group: {
            id: group._id,
            groupName: group.groupName,
            pin: group.pin,
            admin: group.admin,
            members: group.members,
            isActive: group.isActive
          }
        });
      }
      
      // Add as member
      console.log('➕ Adding user to group');
      await group.addMember(req.userId);
      
      await group.populate('admin', 'username name');
      await group.populate('members.user', 'username name isOnline');
      
      console.log('✅ User joined successfully');
      
      return res.json({
        message: 'Joined group successfully',
        group: {
          id: group._id,
          groupName: group.groupName,
          pin: group.pin,
          admin: group.admin,
          members: group.members,
          isActive: group.isActive
        }
      });
    }
    
    // ============================================
    // GUEST USER JOIN
    // ============================================
    console.log('👥 Guest join attempt');
    
    if (!name || !email) {
      console.log('❌ Guest join failed: Name or email missing');
      return res.status(400).json({ 
        error: 'Name and email are required for guest join' 
      });
    }
    
    const emailNorm = email.trim().toLowerCase();
    
    console.log('🔍 Checking if user exists with email:', emailNorm);
    
    let student = await User.findOne({ email: emailNorm });
    
    if (!student) {
      console.log('👤 Creating new student user');
      
      const usernameBase = name.trim().replace(/\s+/g, '_').replace(/[^\w\-._]/g, '').slice(0, 30) || 'student';
      let username = usernameBase;
      let suffix = 0;
      
      while (await User.findOne({ username })) {
        suffix++;
        username = `${usernameBase}_${suffix}`;
        if (suffix > 100) break;
      }
      
      const randomPass = crypto.randomBytes(8).toString('hex');
      
      student = new User({
        username,
        email: emailNorm,
        password: randomPass,
        name: name.trim(),
        role: 'student'
      });
      
      await student.save();
      console.log('✅ New student created:', username);
    } else {
      console.log('✅ Existing user found:', student.username);
    }
    
    // Add to group if not already member
    if (!group.isMember(student._id)) {
      console.log('➕ Adding guest to group');
      await group.addMember(student._id);
    } else {
      console.log('ℹ️ Guest already a member');
    }
    
    const token = generateToken(student._id);
    
    await group.populate('admin', 'username name');
    await group.populate('members.user', 'username name isOnline');
    
    console.log('✅ Guest joined successfully:', student.name);
    
    res.json({
      message: 'Joined group successfully',
      token,
      user: {
        id: student._id.toString(),
        username: student.username,
        email: student.email,
        name: student.name,
        role: student.role
      },
      group: {
        id: group._id,
        groupName: group.groupName,
        pin: group.pin,
        admin: group.admin,
        members: group.members,
        isActive: group.isActive
      }
    });
    
  } catch (error) {
    console.error('❌ Join group error:', error);
    console.error('   Stack:', error.stack);
    res.status(500).json({ 
      error: 'Server error joining group',
      details: error.message 
    });
  }
});

// GET MY GROUPS
app.get('/api/groups/my-groups', authenticateToken, async (req, res) => {
  try {
    const groups = await Group.find({
      'members.user': req.userId
    })
    .populate('admin', 'username name')
    .populate('members.user', 'username name isOnline')
    .sort({ createdAt: -1 });
    
    const groupsWithJoinedAt = groups.map(group => {
      const groupObj = group.toObject();
      
      const currentUserMember = groupObj.members.find(m => 
        m.user._id.toString() === req.userId.toString()
      );
      
      return {
        ...groupObj,
        userJoinedAt: currentUserMember ? currentUserMember.joinedAt : null
      };
    });
    
    res.json({ groups: groupsWithJoinedAt });
    
  } catch (error) {
    console.error('Get groups error:', error);
    res.status(500).json({ error: 'Server error fetching groups' });
  }
});

// GET GROUP DETAILS
app.get('/api/groups/:groupId', authenticateToken, async (req, res) => {
  try {
    const { groupId } = req.params;
    
    const group = await Group.findById(groupId)
      .populate('admin', 'username name')
      .populate('members.user', 'username name isOnline')
      .populate('onlineUsers', 'username');
    
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }
    
    if (!group.isMember(req.userId)) {
      return res.status(403).json({ error: 'You are not a member of this group' });
    }
    
    // ✅ Check if session is still active
    if (!group.isActive) {
      return res.status(403).json({ error: 'This session has ended' });
    }
    
    res.json({ group });
    
  } catch (error) {
    console.error('Get group error:', error);
    res.status(500).json({ error: 'Server error fetching group' });
  }
});

// END SESSION
app.post('/api/groups/:groupId/end', authenticateToken, async (req, res) => {
  try {
    const { groupId } = req.params;
    
    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }
    
    if (!group.isAdmin(req.userId)) {
      return res.status(403).json({ error: 'Only admin can end the session' });
    }
    
    await group.endSession();
    
    console.log('🔴 Session ended:', groupId);
    
    io.to(groupId).emit('sessionEnded', {
      message: 'The admin has ended this session',
      groupId: group._id
    });
    
    res.json({ message: 'Session ended successfully' });
    
  } catch (error) {
    console.error('End session error:', error);
    res.status(500).json({ error: 'Server error ending session' });
  }
});

// ------------------
// MESSAGE ROUTES
// ------------------

app.get('/api/groups/:groupId/messages', authenticateToken, async (req, res) => {
  try {
    const { groupId } = req.params;
    
    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }
    
    if (!group.isMember(req.userId)) {
      return res.status(403).json({ error: 'You are not a member of this group' });
    }
    
    const messages = await Message.find({ group: groupId })
      .populate('sender', 'username name isOnline')
      .sort({ createdAt: 1 })
      .limit(100);
    
    res.json({ messages });
    
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ error: 'Server error fetching messages' });
  }
});

// ============================================
// SOCKET.IO - REAL-TIME COMMUNICATION
// ============================================

io.on('connection', (socket) => {
  console.log('✅ User connected:', socket.id);
  
  socket.userId = null;
  
  // AUTHENTICATION
  socket.on('authenticate', async (token) => {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.userId;
      
      await User.findByIdAndUpdate(socket.userId, {
        socketId: socket.id,
        isOnline: true,
        lastSeen: new Date()
      });
      
      console.log(`✅ User ${socket.userId} authenticated`);
      socket.emit('authenticated', { success: true });
      
    } catch (error) {
      console.error('Socket authentication error:', error);
      socket.emit('authError', { error: 'Invalid token' });
    }
  });
  
  // JOIN GROUP
  socket.on('joinGroup', async (groupId) => {
    try {
      if (!socket.userId) {
        console.log('❌ Join group failed: Not authenticated');
        return socket.emit('error', { error: 'Not authenticated' });
      }
      
      console.log(`📂 User ${socket.userId} joining group ${groupId}`);
      
      const group = await Group.findById(groupId);
      
      if (!group) {
        console.log('❌ Group not found');
        return socket.emit('error', { error: 'Group not found' });
      }
      
      if (!group.isActive) {
        console.log('❌ Session has ended');
        return socket.emit('error', { error: 'This session has ended' });
      }
      
      if (!group.isMember(socket.userId)) {
        console.log('❌ User not a member');
        return socket.emit('error', { error: 'Access denied' });
      }
      
      socket.join(groupId);
      
      if (!group.onlineUsers.includes(socket.userId)) {
        group.onlineUsers.push(socket.userId);
        await group.save();
      }
      
      const user = await User.findById(socket.userId);
      
      socket.to(groupId).emit('userJoined', {
        userId: socket.userId,
        username: user.username,
        timestamp: new Date()
      });
      
      socket.emit('joinedGroup', { groupId });
      
      await group.populate('onlineUsers', 'username');
      io.to(groupId).emit('onlineUsersUpdate', {
        onlineUsers: group.onlineUsers
      });
      
      console.log(`✅ User ${socket.userId} joined group ${groupId}`);
      
    } catch (error) {
      console.error('Join group error:', error);
      socket.emit('error', { error: 'Failed to join group' });
    }
  });
  
  // LEAVE GROUP
  socket.on('leaveGroup', async (groupId) => {
    try {
      if (!socket.userId) return;
      
      const group = await Group.findById(groupId);
      if (!group) return;
      
      group.onlineUsers = group.onlineUsers.filter(
        userId => userId.toString() !== socket.userId.toString()
      );
      await group.save();
      
      socket.leave(groupId);
      
      await group.populate('onlineUsers', 'username');
      io.to(groupId).emit('onlineUsersUpdate', {
        onlineUsers: group.onlineUsers
      });
      
      console.log(`👋 User ${socket.userId} left group ${groupId}`);
      
    } catch (error) {
      console.error('Leave group error:', error);
    }
  });
  
  // SEND MESSAGE
  socket.on('sendMessage', async (data) => {
    try {
      if (!socket.userId) {
        return socket.emit('error', { error: 'Not authenticated' });
      }
      
      const { groupId, content, messageType, recipientId, fileUrl, fileName, fileSize, fileType } = data;
      
      const group = await Group.findById(groupId);
      if (!group || !group.isMember(socket.userId)) {
        return socket.emit('error', { error: 'Access denied' });
      }
      
      const message = new Message({
        group: groupId,
        sender: socket.userId,
        content,
        messageType: messageType || 'text',
        recipient: recipientId || null,
        fileUrl: fileUrl || null,
        fileName: fileName || null,
        fileSize: fileSize || null,
        fileType: fileType || null
      });
      
      await message.save();
      
      await message.populate('sender', 'username name isOnline');
      if (recipientId) {
        await message.populate('recipient', 'username');
      }
      
      if (messageType === 'private' && recipientId) {
        const recipient = await User.findById(recipientId);
        if (recipient && recipient.socketId) {
          io.to(recipient.socketId).emit('newMessage', message);
        }
        socket.emit('newMessage', message);
      } else {
        io.to(groupId).emit('newMessage', message);
      }
      
    } catch (error) {
      console.error('Send message error:', error);
      socket.emit('error', { error: 'Failed to send message' });
    }
  });
  
  // EDIT MESSAGE
  socket.on('editMessage', async (data) => {
    try {
      if (!socket.userId) return;
      
      const { messageId, newContent } = data;
      
      const message = await Message.findById(messageId);
      if (!message) {
        return socket.emit('error', { error: 'Message not found' });
      }
      
      if (message.sender.toString() !== socket.userId.toString()) {
        return socket.emit('error', { error: 'Can only edit your own messages' });
      }
      
      message.content = newContent;
      message.isEdited = true;
      message.editedAt = new Date();
      await message.save();
      
      await message.populate('sender', 'username name isOnline');
      
      io.to(message.group.toString()).emit('messageEdited', message);
      
    } catch (error) {
      console.error('Edit message error:', error);
      socket.emit('error', { error: 'Failed to edit message' });
    }
  });
  
  // DELETE MESSAGE
  socket.on('deleteMessage', async (data) => {
    try {
      if (!socket.userId) return;
      
      const { messageId } = data;
      
      const message = await Message.findById(messageId);
      if (!message) {
        return socket.emit('error', { error: 'Message not found' });
      }
      
      if (message.sender.toString() !== socket.userId.toString()) {
        return socket.emit('error', { error: 'Can only delete your own messages' });
      }
      
      message.isDeleted = true;
      message.content = 'This message was deleted';
      await message.save();
      
      io.to(message.group.toString()).emit('messageDeleted', {
        messageId: message._id,
        groupId: message.group
      });
      
    } catch (error) {
      console.error('Delete message error:', error);
      socket.emit('error', { error: 'Failed to delete message' });
    }
  });
  
  // TYPING INDICATORS
  socket.on('typing', async (data) => {
    try {
      if (!socket.userId) return;
      
      const { groupId } = data;
      const user = await User.findById(socket.userId);
      
      socket.to(groupId).emit('userTyping', {
        userId: socket.userId,
        username: user.username
      });
      
    } catch (error) {
      console.error('Typing indicator error:', error);
    }
  });
  
  socket.on('stopTyping', async (data) => {
    try {
      if (!socket.userId) return;
      
      const { groupId } = data;
      const user = await User.findById(socket.userId);
      
      socket.to(groupId).emit('userStopTyping', {
        userId: socket.userId,
        username: user.username
      });
      
    } catch (error) {
      console.error('Stop typing error:', error);
    }
  });
  
  // DISCONNECT
  socket.on('disconnect', async () => {
    try {
      if (socket.userId) {
        await User.findByIdAndUpdate(socket.userId, {
          isOnline: false,
          lastSeen: new Date(),
          socketId: null
        });
        
        await Group.updateMany(
          { onlineUsers: socket.userId },
          { $pull: { onlineUsers: socket.userId } }
        );
        
        console.log(`👋 User ${socket.userId} disconnected`);
      }
      
    } catch (error) {
      console.error('Disconnect error:', error);
    }
  });
});

// ============================================
// START SERVER
// ============================================

const PORT = process.env.PORT || 5000;

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌐 Local: http://localhost:${PORT}`);
  console.log(`🌐 Network: http://192.168.1.141:${PORT}`);
  console.log(`📁 Uploads: ${uploadsDir}`);
});