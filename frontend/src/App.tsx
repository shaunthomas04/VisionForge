import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Home from './pages/Home'
import JobDetail from './pages/JobDetail'
import DatasetBrowser from './pages/DatasetBrowser'
import Navbar from './components/Navbar'
import BackgroundAnimation from './components/BackgroundAnimation'

export default function App() {
  return (
    <BrowserRouter>
      <BackgroundAnimation />
      <div className="min-h-screen flex flex-col">
        <Navbar />
        <main className="flex-1">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/job/:jobId" element={<JobDetail />} />
            <Route path="/datasets" element={<DatasetBrowser />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}
