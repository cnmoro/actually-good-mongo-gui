import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter, HashRouter, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
// Add page imports here
import ActuallyGoodMongoGui from './pages/ActuallyGoodMongoGui';

const AppRoutes = () => {
  return (
    <Routes>
      <Route path="/" element={<ActuallyGoodMongoGui />} />
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};


function App() {
  const Router = typeof window !== 'undefined' && window.location?.protocol === 'file:' ? HashRouter : BrowserRouter;

  return (
    <QueryClientProvider client={queryClientInstance}>
      <Router>
        <AppRoutes />
      </Router>
      <Toaster />
    </QueryClientProvider>
  )
}

export default App