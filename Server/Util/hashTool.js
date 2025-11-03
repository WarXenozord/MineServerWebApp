import bcrypt from 'bcrypt';

bcrypt.hash('password', 'salt').then(console.log)