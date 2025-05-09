import { randomBytes } from 'crypto';

const lowercaseChars = 'abcdefghijklmnopqrstuvwxyz';
const uppercaseChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const numberChars = '0123456789';
const specialChars = '!@#$%^&*()_+-=[]{}|;:,.<>?';

/**
 * Generates a secure password with the specified requirements
 * @param minLength Minimum length of the password (default: 24)
 * @param minNumbers Minimum number of numeric characters (default: 1)
 * @param minUppercase Minimum number of uppercase letters (default: 1)
 * @param minSpecial Minimum number of special characters (default: 1)
 * @returns A secure password string
 */
export function generateSecurePassword(
  minLength: number = 24,
  minNumbers: number = 1,
  minUppercase: number = 1,
  minSpecial: number = 1
): string {
  // Ensure at least the minimum required characters of each type
  let password = '';

  // Add minimum required lowercase letters (at least 1)
  password += lowercaseChars[randomInt(0, lowercaseChars.length)];

  // Add minimum required uppercase letters
  for (let i = 0; i < minUppercase; i++) {
    password += uppercaseChars[randomInt(0, uppercaseChars.length)];
  }

  // Add minimum required numbers
  for (let i = 0; i < minNumbers; i++) {
    password += numberChars[randomInt(0, numberChars.length)];
  }

  // Add minimum required special characters
  for (let i = 0; i < minSpecial; i++) {
    password += specialChars[randomInt(0, specialChars.length)];
  }

  // Add more random characters to reach the minimum length
  const allChars = lowercaseChars + uppercaseChars + numberChars + specialChars;
  while (password.length < minLength) {
    password += allChars[randomInt(0, allChars.length)];
  }

  // Shuffle the password to make it more random
  return shuffleString(password);
}

/**
 * Generates a cryptographically secure random integer between min (inclusive) and max (exclusive)
 * @param min Minimum value (inclusive)
 * @param max Maximum value (exclusive)
 * @returns A random integer
 */
function randomInt(min: number, max: number): number {
  const range = max - min;
  const bytes = Math.ceil(Math.log2(range) / 8);
  const buffer = randomBytes(bytes);
  let value = 0;

  for (let i = 0; i < bytes; i++) {
    value = (value << 8) + buffer[i];
  }

  // Ensure the value is within the range
  return min + (value % range);
}

/**
 * Shuffles a string using the Fisher-Yates algorithm with cryptographically secure random numbers
 * @param str The string to shuffle
 * @returns The shuffled string
 */
function shuffleString(str: string): string {
  const chars = str.split('');
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}
