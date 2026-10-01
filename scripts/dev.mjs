import express from 'express';
import session from '../api/session.js';
import server, {app} from '../api/ws.js';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
app.post('/api/session',session);app.use(express.static(root+'public',{dotfiles:'deny'}));
const port=Number(process.env.PORT||4173);
server.listen(port,()=>console.log('AiWay: http://localhost:'+port));
