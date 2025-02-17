// Create a random string of given length
export function randomString(length, charset = '') {
  if (!charset) charset = 'abcdefghijklmnopqrstuvwxyz';
  let res = '';
  while (length--) res += charset[(Math.random() * charset.length) | 0];
  return res;
}