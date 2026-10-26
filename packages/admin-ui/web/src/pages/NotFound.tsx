import { Link } from "react-router";
import { Empty } from "../components/ui.tsx";

export function NotFound() {
  return (
    <Empty title="页面不存在">
      <Link to="/" className="text-indigo-600 hover:underline">
        回到概览
      </Link>
    </Empty>
  );
}
