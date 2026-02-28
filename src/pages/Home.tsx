import { useNavigate } from "react-router-dom";
import { ScanBarcode, ClipboardList, GitCompare, Store } from "lucide-react";

const menuItems = [
    {
        icon: ScanBarcode,
        label: "Escanear",
        description: "Leia códigos de barras e registre produtos",
        path: "/scanner",
        gradient: "from-blue-500 to-blue-700",
        shadow: "shadow-blue-500/30",
        bg: "bg-blue-50",
        iconColor: "text-blue-600",
    },
    {
        icon: ClipboardList,
        label: "Lista",
        description: "Visualize e gerencie os produtos da sessão",
        path: "/scanner?tab=list",
        gradient: "from-emerald-500 to-emerald-700",
        shadow: "shadow-emerald-500/30",
        bg: "bg-emerald-50",
        iconColor: "text-emerald-600",
    },
    {
        icon: GitCompare,
        label: "Conferência",
        description: "Importe e confira listas de produtos",
        path: "/scanner?tab=conference",
        gradient: "from-violet-500 to-violet-700",
        shadow: "shadow-violet-500/30",
        bg: "bg-violet-50",
        iconColor: "text-violet-600",
    },
];

const Home = () => {
    const navigate = useNavigate();

    return (
        <div className="min-h-screen bg-background flex flex-col max-w-md mx-auto">
            {/* Header */}
            <header className="bg-primary text-primary-foreground px-5 pt-10 pb-8 safe-top relative overflow-hidden">
                {/* decorative circles */}
                <div className="absolute -top-8 -right-8 w-40 h-40 rounded-full bg-white/10 pointer-events-none" />
                <div className="absolute -bottom-12 -left-6 w-32 h-32 rounded-full bg-white/5 pointer-events-none" />

                <div className="relative flex items-center gap-3 mb-1">
                    <div className="w-11 h-11 rounded-2xl bg-white/20 flex items-center justify-center">
                        <Store className="w-6 h-6" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold leading-tight">SCAN NEWSHOP</h1>
                        <p className="text-xs opacity-70">Sistema de inventário</p>
                    </div>
                </div>
            </header>

            {/* Greeting */}
            <div className="px-5 pt-6 pb-2">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">
                    Menu principal
                </p>
                <h2 className="text-2xl font-bold text-foreground">
                    O que deseja fazer?
                </h2>
            </div>

            {/* Cards */}
            <div className="flex-1 px-4 py-4 space-y-3">
                {menuItems.map((item) => {
                    const Icon = item.icon;
                    return (
                        <button
                            key={item.label}
                            onClick={() => navigate(item.path)}
                            className={`w-full flex items-center gap-4 p-4 rounded-2xl border border-border bg-card shadow-sm active:scale-[0.98] transition-all duration-150 hover:border-primary/30 hover:shadow-md text-left`}
                        >
                            {/* Icon box */}
                            <div
                                className={`w-14 h-14 rounded-xl ${item.bg} flex items-center justify-center flex-shrink-0`}
                            >
                                <Icon className={`w-7 h-7 ${item.iconColor}`} />
                            </div>

                            {/* Text */}
                            <div className="flex-1 min-w-0">
                                <p className="text-base font-bold text-foreground">
                                    {item.label}
                                </p>
                                <p className="text-xs text-muted-foreground leading-snug mt-0.5">
                                    {item.description}
                                </p>
                            </div>

                            {/* Arrow */}
                            <svg
                                className="w-5 h-5 text-muted-foreground/50 flex-shrink-0"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth={2}
                            >
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                            </svg>
                        </button>
                    );
                })}
            </div>

            {/* Footer */}
            <div className="px-5 py-4 text-center">
                <p className="text-xs text-muted-foreground">SCAN NEWSHOP © 2025</p>
            </div>
        </div>
    );
};

export default Home;
