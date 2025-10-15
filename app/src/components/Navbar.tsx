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
    <header className="sticky top-0 z-50 w-full transition-all duration-300 bg-[#fff7f8]">
      <nav className="w-full py-4 px-6 md:px-8 lg:px-12 flex items-center justify-between relative">
        {/* Logo */}
        <div style={{ opacity: 1, transform: 'none' }}>
          <Link to="/" className="flex items-center space-x-2">
            <img 
              src="/logo-shield.svg" 
              alt="Cornerstone Logo" 
              className="h-8 w-auto"
            />
            <span className="text-[#633b3d] font-sans text-2xl font-bold tracking-tighter">
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
          <span className={`block w-6 h-0.5 bg-[#b24e55] transition-all duration-300 ${isOpen ? 'rotate-45 translate-y-1.5' : ''}`}></span>
          <span className={`block w-6 h-0.5 bg-[#b24e55] my-1 transition-all duration-300 ${isOpen ? 'opacity-0' : ''}`}></span>
          <span className={`block w-6 h-0.5 bg-[#b24e55] transition-all duration-300 ${isOpen ? '-rotate-45 -translate-y-1.5' : ''}`}></span>
        </button>

        {/* Desktop Navigation */}
        <div className="hidden md:flex items-center space-x-8 font-medium lg:-mr-24 lg:-ml-1" style={{ opacity: 1, transform: 'none' }}>
          {navLinks.map((link) => (
            <Link
              key={link.path}
              to={link.path}
              className={`${
                isActive(link.path) 
                  ? 'text-[#633b3d]  font-bold' 
                  : 'text-[#633b3d]  font-bold'
              } hover:text-[#E75A82] transition-colors`}
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
                className="h-10 px-4 py-2 text-[#633b3d]  hover:text-[#fc6f78] border border-[#b24e55] hover:border-[#fc6f78] hover:bg-transparent rounded-lg"
              >
                <Wallet className="w-4 h-4 mr-2" />
                {formatAddress}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={disconnect}
                className="h-10 w-10 text-[#633b3d]  hover:text-[#fc6f78] hover:bg-transparent"
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
              className="h-10 px-4 py-2 text-[#b24e55] hover:text-[#fc6f78] border border-[#b24e55] hover:border-[#fc6f78] hover:bg-transparent rounded-lg"
            >
              <Wallet className="w-4 h-4 mr-2" />
              {isConnecting ? 'Connecting...' : 'Connect Wallet'}
            </Button>
          )}
          {/* <Link to="/projects/new">
            <Button className="h-10 px-4 py-2 bg-gradient-to-t from-[#b24e55] to-[#E3405F] text-white rounded-lg hover:opacity-90">
              Create Project
            </Button>
          </Link> */}
        </div>

        {/* Mobile Menu */}
        {isOpen && (
          <div className="absolute top-full left-0 w-full bg-[#fff7f8] md:hidden shadow-lg">
            <div className="flex flex-col space-y-4 p-6">
              {navLinks.map((link) => (
                <Link
                  key={link.path}
                  to={link.path}
                  onClick={() => setIsOpen(false)}
                  className={`${
                    isActive(link.path) 
                      ? 'text-[#b24e55] font-bold' 
                      : 'text-[#b24e55] font-bold'
                  } hover:text-[#E75A82] transition-colors`}
                >
                  {link.label}
                </Link>
              ))}
              <div className="flex flex-col space-y-2 pt-4">
                {isConnected ? (
                  <>
                    <Button
                      variant="outline"
                      className="w-full text-[#b24e55] hover:text-[#fc6f78] border border-[#b24e55] hover:border-[#fc6f78] hover:bg-transparent rounded-lg"
                    >
                      <Wallet className="w-4 h-4 mr-2" />
                      {formatAddress}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={disconnect}
                      className="w-full text-[#b24e55] hover:text-[#fc6f78] border border-[#b24e55] hover:border-[#fc6f78] hover:bg-transparent rounded-lg"
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
                    className="w-full text-[#b24e55] hover:text-[#fc6f78] border border-[#b24e55] hover:border-[#fc6f78] hover:bg-transparent rounded-lg"
                  >
                    <Wallet className="w-4 h-4 mr-2" />
                    {isConnecting ? 'Connecting...' : 'Connect Wallet'}
                  </Button>
                )}
                <Link to="/projects/new" onClick={() => setIsOpen(false)}>
                  <Button className="w-full bg-gradient-to-t from-[#b24e55] to-[#E3405F] text-white rounded-lg hover:opacity-90">
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
