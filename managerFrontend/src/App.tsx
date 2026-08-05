/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './views/Dashboard';
import QuestBuilder from './views/QuestBuilder';
import LiveRoomMonitor from './views/LiveRoomMonitor';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="builder" element={<QuestBuilder />} />
          <Route path="builder/:gameId" element={<QuestBuilder />} />
          <Route path="monitor">
            <Route index element={<LiveRoomMonitor />} />
            <Route path=":roomId" element={<LiveRoomMonitor />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
