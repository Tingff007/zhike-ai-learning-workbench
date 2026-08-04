import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';
import { router } from './app/router';
import { ConfirmProvider } from './context/ConfirmContext';
import { ScrollerActivity } from './components/shared/ScrollerActivity';
import './styles/global-styles';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount) => {
        if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
        return failureCount < 1;
      },
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: false,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ConfirmProvider>
        <ScrollerActivity />
        <RouterProvider router={router} />
      </ConfirmProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
