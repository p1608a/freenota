
import { useEffect } from "react";
import { BrowserRouter, Routes, Route, useParams } from "react-router-dom";
import { Whiteboard } from "./components/Whiteboard";
import { Sidebar } from "./components/Sidebar";
import { useNoteStore } from "./store/noteStore";
import { Home } from "./components/Home";

// Layout for the active notebook editor
const EditorLayout = () => {
  const { id } = useParams();
  const { openNotebook } = useNoteStore();

  useEffect(() => {
    if (id) {
      openNotebook(id);
    }
  }, [id]);

  return (
    <div className="w-screen h-screen overflow-hidden bg-gray-50 flex flex-row">
      <Sidebar />
      <div className="flex-1 h-full relative">
        <Whiteboard />
      </div>
    </div>
  );
};


function App() {
  const { loadFromStorage, isLoaded } = useNoteStore();

  useEffect(() => {
    loadFromStorage();
  }, []);

  if (!isLoaded) {
    return (
      <div className="w-screen h-screen flex items-center justify-center bg-gray-50">
        <div className="text-xl font-medium text-gray-500 animate-pulse">
          Loading Library...
        </div>
      </div>
    );
  }

  return (
    <div className="w-screen h-screen">
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/notebook/:id" element={<EditorLayout />} />
        </Routes>
      </BrowserRouter>
    </div>
  );
}

export default App;
