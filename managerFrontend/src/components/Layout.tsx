import { Outlet, Link, useLocation } from 'react-router-dom';
import { Map, LayoutDashboard, Route, Gamepad2 } from 'lucide-react';
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { useState } from 'react';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function Layout() {
  const location = useLocation();
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(false);

  const navigation = [
    { name: 'Dashboard', href: '/', icon: LayoutDashboard },
    { name: 'Quest Builder', href: '/builder', icon: Route },
    { name: 'Live Monitor', href: '/monitor', icon: Map },
  ];

  return (
    <div className="flex h-screen bg-neutral-50 text-neutral-900">
      {/* Sidebar */}
      <div 
        className={cn(
          "bg-white border-r border-neutral-200 flex flex-col transition-all duration-300 ease-in-out z-50",
          isSidebarExpanded ? "w-64" : "w-16"
        )}
        onMouseEnter={() => setIsSidebarExpanded(true)}
        onMouseLeave={() => setIsSidebarExpanded(false)}
      >
        <div className="h-16 flex items-center justify-center px-4 border-b border-neutral-200 font-bold text-lg text-indigo-600 overflow-hidden whitespace-nowrap">
          {isSidebarExpanded ? (
             <span className="opacity-100 transition-opacity duration-300 delay-100">Manager Frontend</span>
          ) : (
             <Gamepad2 className="w-6 h-6 text-indigo-600 flex-shrink-0" />
          )}
        </div>
        <nav className="flex-1 p-3 space-y-2 overflow-hidden">
          {navigation.map((item) => {
            const isActive = location.pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.name}
                to={item.href}
                className={cn(
                  "flex items-center text-sm font-medium rounded-md group transition-all",
                  isActive
                    ? "bg-indigo-50 text-indigo-600"
                    : "text-neutral-700 hover:bg-neutral-100",
                  isSidebarExpanded ? "px-3 py-2" : "px-0 py-2 justify-center"
                )}
                title={!isSidebarExpanded ? item.name : undefined}
              >
                <Icon
                  className={cn(
                    "flex-shrink-0 h-5 w-5",
                    isActive ? "text-indigo-600" : "text-neutral-400 group-hover:text-neutral-500",
                    isSidebarExpanded ? "mr-3" : ""
                  )}
                  aria-hidden="true"
                />
                {isSidebarExpanded && (
                  <span className="whitespace-nowrap opacity-100 transition-opacity duration-300">{item.name}</span>
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <main className="flex-1 relative overflow-y-auto focus:outline-none">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
