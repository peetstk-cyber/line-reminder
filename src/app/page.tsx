import { Bell, Sparkles, CheckCircle2, Calendar } from "lucide-react";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6 bg-slate-50 text-slate-900">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 border border-slate-100 text-center">
        <div className="mx-auto w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-5">
          <Bell className="w-8 h-8" />
        </div>
        
        <h1 className="text-2xl font-bold text-slate-800 flex items-center justify-center gap-2">
          LINE AI Reminder <Sparkles className="w-5 h-5 text-amber-500" />
        </h1>
        
        <p className="text-sm text-slate-500 mt-2 leading-relaxed">
          ระบบช่วยจำอัจฉริยะผ่าน LINE Official Account และ LIFF Web App
        </p>

        <div className="mt-6 grid grid-cols-2 gap-3 text-left">
          <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-100 flex items-start gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-semibold text-emerald-900">Natural Language</p>
              <p className="text-[11px] text-emerald-700">เข้าใจคำสั่งเสียงและข้อความ</p>
            </div>
          </div>
          <div className="p-3 bg-blue-50 rounded-xl border border-blue-100 flex items-start gap-2">
            <Calendar className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-semibold text-blue-900">Smart Schedule</p>
              <p className="text-[11px] text-blue-700">เตือนตรงเวลา ไม่พลาดทุกงาน</p>
            </div>
          </div>
        </div>

        <div className="mt-8 pt-6 border-t border-slate-100 flex flex-col gap-2">
          <span className="inline-flex items-center justify-center px-3 py-1 text-xs font-medium bg-emerald-100 text-emerald-800 rounded-full w-fit mx-auto">
            🚀 Ready for Step 2
          </span>
          <p className="text-xs text-slate-400">Server & Database Ready</p>
        </div>
      </div>
    </main>
  );
}
