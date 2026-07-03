import { Route, Routes } from "react-router-dom"

import { Landing } from "@/pages/Landing"
import { Workspace } from "@/pages/Workspace"

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/p/:code" element={<Workspace />} />
    </Routes>
  )
}

export default App
