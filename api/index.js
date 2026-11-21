import { createApp } from '../server.js';

let appPromise;

async function getApp() {
  if (!appPromise) appPromise = Promise.resolve(createApp());
  const app = await appPromise;
  await app.ready;
  return app;
}

export default async function handler(req, res) {
  const app = await getApp();
  app.server.emit('request', req, res);
}
