// test-socket.js
// Run with: node test-socket.js
// Make sure to install socket.io-client first: npm install socket.io-client

const io = require('socket.io-client');

console.log('🚀 Starting WebSocket test...\n');

// Create first connection
const socket1 = io('http://localhost:3000', {
  transports: ['websocket', 'polling'],
});

socket1.on('connect', () => {
  console.log('✅ Socket 1 connected!');
  console.log(`   Socket ID: ${socket1.id}\n`);

  // Join as Alice
  console.log('📤 Socket 1: Sending join event as Alice...');
  socket1.emit('join', {
    userId: 'alice123',
    username: 'Alice',
  });
});

socket1.on('connected', (data) => {
  console.log('📥 Socket 1: Received "connected" event');
  console.log(`   ${JSON.stringify(data)}\n`);
});

socket1.on('joinSuccess', (data) => {
  console.log('📥 Socket 1: Received "joinSuccess" event');
  console.log(`   ${JSON.stringify(data)}\n`);

  // Send a message after joining
  setTimeout(() => {
    console.log('📤 Socket 1: Sending message...');
    socket1.emit('sendMessage', {
      userId: 'alice123',
      text: 'Hello from Alice!',
    });
  }, 1000);
});

socket1.on('userJoined', (data) => {
  console.log('📥 Socket 1: Received "userJoined" event');
  console.log(`   ${data.username} joined\n`);
});

socket1.on('newMessage', (data) => {
  console.log('📥 Socket 1: Received "newMessage" event');
  console.log(`   ${data.username}: ${data.text}\n`);
});

socket1.on('onlineCount', (count) => {
  console.log('📥 Socket 1: Received "onlineCount" event');
  console.log(`   Online users: ${count}\n`);
});

socket1.on('error', (error) => {
  console.error('❌ Socket 1: Received "error" event');
  console.error(`   ${JSON.stringify(error)}\n`);
});

socket1.on('disconnect', () => {
  console.log('❌ Socket 1 disconnected\n');
});

// Create second connection after 3 seconds
setTimeout(() => {
  console.log('\n🚀 Starting second connection...\n');

  const socket2 = io('http://localhost:3000', {
    transports: ['websocket', 'polling'],
  });

  socket2.on('connect', () => {
    console.log('✅ Socket 2 connected!');
    console.log(`   Socket ID: ${socket2.id}\n`);

    // Join as Bob
    console.log('📤 Socket 2: Sending join event as Bob...');
    socket2.emit('join', {
      userId: 'bob456',
      username: 'Bob',
    });
  });

  socket2.on('connected', (data) => {
    console.log('📥 Socket 2: Received "connected" event');
    console.log(`   ${JSON.stringify(data)}\n`);
  });

  socket2.on('joinSuccess', (data) => {
    console.log('📥 Socket 2: Received "joinSuccess" event');
    console.log(`   ${JSON.stringify(data)}\n`);

    // Send a message after joining
    setTimeout(() => {
      console.log('📤 Socket 2: Sending message...');
      socket2.emit('sendMessage', {
        userId: 'bob456',
        text: 'Hello from Bob!',
      });
    }, 1000);
  });

  socket2.on('userJoined', (data) => {
    console.log('📥 Socket 2: Received "userJoined" event');
    console.log(`   ${data.username} joined\n`);
  });

  socket2.on('newMessage', (data) => {
    console.log('📥 Socket 2: Received "newMessage" event');
    console.log(`   ${data.username}: ${data.text}\n`);
  });

  socket2.on('onlineCount', (count) => {
    console.log('📥 Socket 2: Received "onlineCount" event');
    console.log(`   Online users: ${count}\n`);
  });

  socket2.on('error', (error) => {
    console.error('❌ Socket 2: Received "error" event');
    console.error(`   ${JSON.stringify(error)}\n`);
  });

  socket2.on('disconnect', () => {
    console.log('❌ Socket 2 disconnected\n');
  });

  // Clean up after 10 seconds
  setTimeout(() => {
    console.log('\n🛑 Closing connections...');
    socket2.disconnect();
    socket1.disconnect();

    setTimeout(() => {
      console.log('\n✅ Test complete!');
      process.exit(0);
    }, 1000);
  }, 8000);
}, 3000);

// Handle errors
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error.message);
  process.exit(1);
});

process.on('unhandledRejection', (error) => {
  console.error('❌ Unhandled Rejection:', error);
  process.exit(1);
});
