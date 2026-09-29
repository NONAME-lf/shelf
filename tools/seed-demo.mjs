#!/usr/bin/env node
// Creates three demo users and uploads the demo files through the REST API (idempotent).
import { readdir, readFile } from 'node:fs/promises';

const API = `${(process.env.SHELF_API ?? 'http://localhost:4000').replace(/\/+$/, '')}/api`;
const PASSWORD = 'shelf-demo-2026';
const USERS = [
  { email: 'artem@shelf.dev', displayName: 'Артем', files: 'all' },
  { email: 'iryna@shelf.dev', displayName: 'Ірина', files: ['todo.txt', 'geometry.cpp', 'mountains.jpg'] },
  { email: 'maksym@shelf.dev', displayName: 'Максим', files: ['README.md', 'shelf-logo.png'] },
];
const DIR = new URL('./demo-files/', import.meta.url);

async function postJson(path, body) {
  return fetch(API + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

async function tokenFor(user) {
  let response = await postJson('/auth/register', { email: user.email, password: PASSWORD, displayName: user.displayName });
  if (response.status === 409) response = await postJson('/auth/login', { email: user.email, password: PASSWORD });
  if (!response.ok) throw new Error(`${user.email}: ${response.status} ${await response.text()}`);
  return (await response.json()).accessToken;
}

async function upload(token, name) {
  const form = new FormData();
  form.append('file', new Blob([await readFile(new URL(name, DIR))]), name);
  const response = await fetch(`${API}/workspace/files`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
  if (!response.ok) throw new Error(`${name}: ${response.status} ${await response.text()}`);
  return response.status === 201 ? 'створено' : 'оновлено';
}

const allFiles = (await readdir(DIR)).filter((name) => !name.startsWith('.')).sort();
for (const user of USERS) {
  const token = await tokenFor(user);
  for (const name of user.files === 'all' ? allFiles : user.files) {
    console.log(`${user.email}: ${name} — ${await upload(token, name)}`);
  }
}
console.log(`Готово. Пароль усіх демо-користувачів: ${PASSWORD}`);
