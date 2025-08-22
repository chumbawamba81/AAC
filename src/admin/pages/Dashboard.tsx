import QuickDiagnostics from "../components/QuickDiagnostics";

export default function AdminDashboard() {
  return (
    <div className="max-w-6xl mx-auto p-6 space-y-4">
      {/* ...outros widgets/cards... */}
      <QuickDiagnostics />
    </div>
  );
}
