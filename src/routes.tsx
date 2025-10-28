import ChatPage from './pages/ChatPage';
import { AuthPage } from './pages/AuthPage';
import type { ReactNode } from 'react';

interface RouteConfig {
  name: string;
  path: string;
  element: ReactNode;
  visible?: boolean;
}

const routes: RouteConfig[] = [
  {
    name: 'AI对话',
    path: '/',
    element: <ChatPage />
  },
  {
    name: '认证',
    path: '/auth',
    element: <AuthPage />,
    visible: false
  },
  {
    name: '聊天',
    path: '/chat',
    element: <ChatPage />,
    visible: false
  }
];

export default routes;