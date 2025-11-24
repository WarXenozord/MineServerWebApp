import bcrypt from 'bcrypt';

bcrypt.hash('password', 10).then(console.log)