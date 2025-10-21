import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAllProjects, Project } from '@/lib/envio';
import { MinecraftProjectCard } from '@/components/MinecraftProjectCard';
import { Button } from '@/components/ui/button';
import { Plus, Loader2, Search, Filter, RefreshCw } from 'lucide-react';
import { Input } from '@/components/ui/input';

const AllProjects = () => {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'funding' | 'active' | 'closed'>('all');

  const fetchProjects = async () => {
    setLoading(true);
    try {
      const { projects: fetchedProjects } = await getAllProjects();
      setProjects(fetchedProjects);
    } catch (error) {
      console.error('Error fetching projects:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();

    // Refetch when window gains focus (e.g., coming back from another tab)
    const handleFocus = () => {
      fetchProjects();
    };

    window.addEventListener('focus', handleFocus);

    // Cleanup
    return () => {
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  // Filter projects based on search and status
  const filteredProjects = projects.filter(project => {
    // Search filter
    const matchesSearch = 
      project.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      project.creator.toLowerCase().includes(searchTerm.toLowerCase()) ||
      project.address.toLowerCase().includes(searchTerm.toLowerCase());

    // Status filter
    let matchesStatus = true;
    if (filterStatus !== 'all') {
      const state = project.projectState;
      if (filterStatus === 'funding') {
        matchesStatus = !state?.fundraiseClosed;
      } else if (filterStatus === 'active') {
        matchesStatus = state?.fundraiseClosed && state?.fundraiseSuccessful;
      } else if (filterStatus === 'closed') {
        matchesStatus = state?.fundraiseClosed && !state?.fundraiseSuccessful;
      }
    }

    return matchesSearch && matchesStatus;
  });

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#87CEEB] via-[#B0D9F0] to-[#D4E8F5]">
      {/* Minecraft sky background */}
      <div className="absolute inset-0 opacity-10 pointer-events-none">
        <div className="absolute inset-0 bg-[repeating-linear-gradient(0deg,transparent,transparent_16px,rgba(0,0,0,0.1)_16px,rgba(0,0,0,0.1)_18px)]"></div>
        <div className="absolute inset-0 bg-[repeating-linear-gradient(90deg,transparent,transparent_16px,rgba(0,0,0,0.1)_16px,rgba(0,0,0,0.1)_18px)]"></div>
      </div>

      <div className="container mx-auto px-4 py-12 relative z-10">
        {/* Header Section */}
        <div className="mb-12">
          {/* Title with Minecraft style */}
          <div className="bg-gradient-to-b from-[#654321] to-[#3D2817] p-1 mb-4 inline-block">
            <div className="bg-gradient-to-b from-[#8B4513] to-[#654321] px-8 py-6 border-4 border-[#3D2817]">
              <h1 className="text-4xl md:text-5xl font-bold text-[#FFD700] mb-2 [text-shadow:_3px_3px_0_rgb(0_0_0_/_40%)]">
                ALL PROJECTS
              </h1>
              <p className="text-white text-lg font-semibold">
                Explore and support amazing community projects
              </p>
            </div>
          </div>

          {/* Info Note */}
          <div className="mb-6 bg-[#5599FF]/20 border-4 border-[#5599FF] p-4 max-w-2xl">
            <p className="text-sm text-[#2D1B00] font-semibold">
              💡 <strong>Just created a project?</strong> It may take a few moments for the indexer to process. 
              Click the <strong className="text-[#5599FF]">REFRESH</strong> button to check for new projects.
            </p>
          </div>

          {/* Action Bar */}
          <div className="flex flex-col md:flex-row gap-4 items-center justify-between mb-8">
            {/* Search Bar - Minecraft style */}
            <div className="relative w-full md:w-96">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 z-10">
                <Search className="w-5 h-5 text-[#654321]" />
              </div>
              <Input
                type="text"
                placeholder="Search by ID, creator address..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 h-12 bg-[#D2B48C] border-4 border-[#654321] text-[#2D1B00] placeholder:text-[#5D4E37] font-semibold shadow-[2px_2px_0px_0px_rgba(0,0,0,0.3)] focus:shadow-[4px_4px_0px_0px_rgba(0,0,0,0.3)] transition-shadow"
              />
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3">
              {/* Refresh Button */}
              <Button
                onClick={fetchProjects}
                disabled={loading}
                size="lg"
                className="h-12 px-6 bg-[#5599FF] hover:bg-[#4488EE] text-white font-bold border-4 border-[#2D5788] shadow-[3px_3px_0px_0px_rgba(0,0,0,0.3)] hover:shadow-[5px_5px_0px_0px_rgba(0,0,0,0.3)] transition-all active:translate-y-1 active:shadow-[1px_1px_0px_0px_rgba(0,0,0,0.3)] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <RefreshCw className={`w-5 h-5 mr-2 ${loading ? 'animate-spin' : ''}`} />
                REFRESH
              </Button>

              {/* Create Project Button */}
              <Button
                onClick={() => navigate('/projects/new')}
                size="lg"
                className="h-12 px-6 bg-[#55AA55] hover:bg-[#449944] text-white font-bold border-4 border-[#2D572D] shadow-[3px_3px_0px_0px_rgba(0,0,0,0.3)] hover:shadow-[5px_5px_0px_0px_rgba(0,0,0,0.3)] transition-all active:translate-y-1 active:shadow-[1px_1px_0px_0px_rgba(0,0,0,0.3)]"
              >
                <Plus className="w-5 h-5 mr-2" />
                CREATE PROJECT
              </Button>
            </div>
          </div>

          {/* Filter Buttons */}
          <div className="flex flex-wrap gap-3">
            {[
              { label: 'ALL', value: 'all' as const },
              { label: 'FUNDING', value: 'funding' as const },
              { label: 'ACTIVE', value: 'active' as const },
              { label: 'CLOSED', value: 'closed' as const },
            ].map((filter) => (
              <button
                key={filter.value}
                onClick={() => setFilterStatus(filter.value)}
                className={`px-6 py-2 font-bold text-sm border-4 shadow-[2px_2px_0px_0px_rgba(0,0,0,0.3)] transition-all hover:translate-y-[-2px] hover:shadow-[3px_3px_0px_0px_rgba(0,0,0,0.3)] active:translate-y-0 active:shadow-[1px_1px_0px_0px_rgba(0,0,0,0.3)] ${
                  filterStatus === filter.value
                    ? 'bg-[#FFD700] text-[#2D1B00] border-[#AA7700]'
                    : 'bg-[#8B7355] text-white border-[#654321]'
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="bg-gradient-to-b from-[#8B4513] to-[#654321] p-1 mb-4">
              <div className="bg-[#D2B48C] p-8 border-4 border-[#654321]">
                <Loader2 className="w-12 h-12 animate-spin text-[#654321]" />
              </div>
            </div>
            <p className="text-xl font-bold text-[#2D1B00] [text-shadow:_2px_2px_0_rgb(255_255_255_/_60%)]">
              Loading Projects...
            </p>
          </div>
        )}

        {/* Empty State */}
        {!loading && filteredProjects.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="bg-gradient-to-b from-[#8B4513] to-[#654321] p-1 mb-6">
              <div className="bg-[#D2B48C] p-12 border-4 border-[#654321]">
                <div className="text-6xl mb-4">📦</div>
                <p className="text-2xl font-bold text-[#2D1B00]">No Projects Found</p>
              </div>
            </div>
            <p className="text-lg text-[#5D4E37] mb-6">
              {searchTerm || filterStatus !== 'all'
                ? 'Try adjusting your filters'
                : 'Be the first to create a project!'}
            </p>
            {!searchTerm && filterStatus === 'all' && (
              <Button
                onClick={() => navigate('/projects/new')}
                size="lg"
                className="h-12 px-6 bg-[#55AA55] hover:bg-[#449944] text-white font-bold border-4 border-[#2D572D] shadow-[3px_3px_0px_0px_rgba(0,0,0,0.3)]"
              >
                <Plus className="w-5 h-5 mr-2" />
                CREATE FIRST PROJECT
              </Button>
            )}
          </div>
        )}

        {/* Projects Grid */}
        {!loading && filteredProjects.length > 0 && (
          <>
            {/* Stats Bar */}
            <div className="mb-8 bg-gradient-to-b from-[#8B7355] to-[#6B5835] p-1">
              <div className="bg-[#A0826D] px-6 py-3 border-4 border-[#654321] flex items-center justify-between">
                <p className="text-white font-bold">
                  Showing {filteredProjects.length} project{filteredProjects.length !== 1 ? 's' : ''}
                </p>
                {(searchTerm || filterStatus !== 'all') && (
                  <button
                    onClick={() => {
                      setSearchTerm('');
                      setFilterStatus('all');
                    }}
                    className="text-[#FFD700] hover:text-[#FFEE99] font-bold text-sm underline"
                  >
                    Clear Filters
                  </button>
                )}
              </div>
            </div>

            {/* Grid of Projects */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {filteredProjects.map((project) => (
                <MinecraftProjectCard
                  key={project.id}
                  project={project}
                  supportersCount={0} // You can fetch this separately if needed
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default AllProjects;
