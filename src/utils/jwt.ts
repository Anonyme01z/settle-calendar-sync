import * as jwt from 'jsonwebtoken';
import * as dotenv from 'dotenv';

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRE_TIME = process.env.JWT_EXPIRE_TIME || '7d';

if (!JWT_SECRET || JWT_SECRET.length < 32) {
  throw new Error('FATAL: JWT_SECRET env var is missing or too short (min 32 chars). Set it before starting the server.');
}

export const generateToken = (userId: string): string => {
  // The payload can be extended in the future (e.g., roles, permissions)
  return jwt.sign(
    { userId },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRE_TIME }
  );
};

export const verifyToken = (token: string): { userId: string } => {
  return jwt.verify(token, JWT_SECRET) as { userId: string };
};
