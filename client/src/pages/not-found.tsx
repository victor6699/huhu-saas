import { useLocation } from "wouter";

export default function NotFound() {
  const [, nav] = useLocation();
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-gray-200 mb-4">404</h1>
        <p className="text-gray-500 mb-6">找不到此頁面</p>
        <button onClick={() => nav("/")} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm">回到首頁</button>
      </div>
    </div>
  );
}
