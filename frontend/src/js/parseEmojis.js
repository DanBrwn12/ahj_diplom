import emojis from './emojis';

export default function parseEmojis(text) {
  return text.replace(/:([a-z0-9_]+):/gi, (match, code) => {
    const key = code.toLowerCase();
    return emojis[key] || match;
  });
}