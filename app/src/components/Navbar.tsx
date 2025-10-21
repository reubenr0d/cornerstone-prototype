import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useWallet } from '@/hooks/use-wallet';
import { Wallet, LogOut } from 'lucide-react';

const Navbar = () => {
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();
  const { account, isConnected, isConnecting, connect, disconnect, formatAddress } = useWallet();

  const isActive = (path: string) => {
    return location.pathname === path;
  };

  const navLinks = [
    { path: '/', label: 'Home' },
    { path: '/dashboard', label: 'Dashboard' },
    { path: '/projects/1', label: 'Projects' },
    { path: '/about', label: 'About' },
    
  ];

  return (
    <header className="sticky top-0 z-50 w-full transition-all duration-300 bg-[#8B7355] border-b-4 border-[#654321] shadow-lg">
      <nav className="w-full py-4 px-6 md:px-8 lg:px-12 flex items-center justify-between relative">
        {/* Logo */}
        <div style={{ opacity: 1, transform: 'none' }}>
          <Link to="/" className="flex items-center space-x-2">
            <img 
              src="/logo-shield.svg" 
              alt="Cornerstone Logo" 
              className="h-8 w-auto pixelated"
            />
            <span className="text-[#FFD700] font-sans text-2xl font-bold tracking-tighter drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
              Cornerstone
            </span>
          </Link>
        </div>

        {/* Mobile Menu Button */}
        <button 
          className="md:hidden flex flex-col justify-center items-center w-8 h-8"
          aria-label="Toggle menu"
          onClick={() => setIsOpen(!isOpen)}
        >
          <span className={`block w-6 h-0.5 bg-[#FFD700] transition-all duration-300 ${isOpen ? 'rotate-45 translate-y-1.5' : ''}`}></span>
          <span className={`block w-6 h-0.5 bg-[#FFD700] my-1 transition-all duration-300 ${isOpen ? 'opacity-0' : ''}`}></span>
          <span className={`block w-6 h-0.5 bg-[#FFD700] transition-all duration-300 ${isOpen ? '-rotate-45 -translate-y-1.5' : ''}`}></span>
        </button>

        {/* Desktop Navigation */}
        <div className="hidden md:flex items-center space-x-8 font-medium lg:-mr-24 lg:-ml-1" style={{ opacity: 1, transform: 'none' }}>
          {navLinks.map((link) => (
            <Link
              key={link.path}
              to={link.path}
              className={`${
                isActive(link.path) 
                  ? 'text-[#FFD700]  font-bold' 
                  : 'text-white  font-bold'
              } hover:text-[#FFD700] transition-colors drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]`}
            >
              {link.label}
            </Link>
          ))}
        </div>

        {/* Desktop CTA Buttons */}
        <div className="hidden md:flex items-center space-x-4" style={{ opacity: 1, transform: 'none' }}>
          {isConnected ? (
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                className="minecraft-button h-10 px-4 py-2 text-white bg-[#8B7355] hover:bg-[#654321] border-4 border-[#654321] font-bold"
              >
                <Wallet className="w-4 h-4 mr-2" />
                {formatAddress}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={disconnect}
                className="minecraft-button h-10 w-10 bg-[#DC143C] hover:bg-[#8B0000] text-white border-4 border-[#8B0000]"
                title="Disconnect"
              >
                <LogOut className="w-4 h-4" />
              </Button>
            </div>
          ) : (
            <Button
              variant="outline"
              onClick={connect}
              disabled={isConnecting}
              className="minecraft-button h-10 px-4 py-2 text-white bg-[#228B22] hover:bg-[#006400] border-4 border-[#006400] font-bold"
            >
              <Wallet className="w-4 h-4 mr-2" />
              {isConnecting ? 'Connecting...' : 'Connect Wallet'}
            </Button>
          )}
          <Link to="/projects/new">
            <Button className="minecraft-button h-10 px-4 py-2 bg-[#ff9600] hover:bg-[#ff7700] text-white border-4 border-[#cc7700] font-bold">
              Create Project
            </Button>
          </Link>
        </div>

        {/* Mobile Menu */}
        {isOpen && (
          <div className="absolute top-full left-0 w-full bg-[#8B7355] md:hidden shadow-lg border-t-4 border-[#654321]">
            <div className="flex flex-col space-y-4 p-6">
              {navLinks.map((link) => (
                <Link
                  key={link.path}
                  to={link.path}
                  onClick={() => setIsOpen(false)}
                  className={`${
                    isActive(link.path) 
                      ? 'text-[#FFD700] font-bold' 
                      : 'text-white font-bold'
                  } hover:text-[#FFD700] transition-colors drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]`}
                >
                  {link.label}
                </Link>
              ))}
              <div className="flex flex-col space-y-2 pt-4">
                {isConnected ? (
                  <>
                    <Button
                      variant="outline"
                      className="minecraft-button w-full text-white bg-[#8B7355] hover:bg-[#654321] border-4 border-[#654321] font-bold"
                    >
                      <Wallet className="w-4 h-4 mr-2" />
                      {formatAddress}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={disconnect}
                      className="minecraft-button w-full text-white bg-[#DC143C] hover:bg-[#8B0000] border-4 border-[#8B0000] font-bold"
                    >
                      <LogOut className="w-4 h-4 mr-2" />
                      Disconnect
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="outline"
                    onClick={connect}
                    disabled={isConnecting}
                    className="minecraft-button w-full text-white bg-[#228B22] hover:bg-[#006400] border-4 border-[#006400] font-bold"
                  >
                    <Wallet className="w-4 h-4 mr-2" />
                    {isConnecting ? 'Connecting...' : 'Connect Wallet'}
                  </Button>
                )}
                <Link to="/projects/new" onClick={() => setIsOpen(false)}>
                  <Button className="minecraft-button w-full bg-[#ff9600] hover:bg-[#ff7700] text-white border-4 border-[#cc7700] font-bold">
                    Create Project
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        )}
      </nav>
    </header>
  );
};

export default Navbar;
