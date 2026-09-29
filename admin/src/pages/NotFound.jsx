import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div className="grid place-items-center gap-3 p-10 text-center">
      <h1 className="text-2xl font-bold">الصفحة غير موجودة</h1>
      <Link to="/pos" className="text-primary underline underline-offset-4">العودة إلى نقطة البيع</Link>
    </div>
  );
}
