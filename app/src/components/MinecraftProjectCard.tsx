import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Project } from '@/lib/envio';
import { Badge } from '@/components/ui/badge';
import { Users, Target, TrendingUp, Loader2 } from 'lucide-react';
import { ProjectMetadata, resolveImageUri } from '@/lib/ipfs';

interface MinecraftProjectCardProps {
  project: Project;
  supportersCount: number;
  metadata?: ProjectMetadata;
}

export const MinecraftProjectCard = ({ project, supportersCount, metadata }: MinecraftProjectCardProps) => {
  const navigate = useNavigate();
  const [imageLoaded, setImageLoaded] = React.useState(false);
  
  const totalRaised = project.projectState?.totalRaised 
    ? Number(BigInt(project.projectState.totalRaised) / 1_000_000n)
    : 0;
  
  const isFundraisingOpen = !project.projectState?.fundraiseClosed;
  const isFundraiseSuccessful = project.projectState?.fundraiseSuccessful;
  
  let statusBadge = {
    text: 'FUNDING',
    color: 'bg-[#FFD700] text-[#2D1B00] border-[#AA7700]'
  };
  
  if (project.projectState?.fundraiseClosed) {
    if (isFundraiseSuccessful) {
      statusBadge = {
        text: 'ACTIVE',
        color: 'bg-[#55AA55] text-white border-[#2D572D]'
      };
    } else {
      statusBadge = {
        text: 'CLOSED',
        color: 'bg-[#8B7355] text-white border-[#654321]'
      };
    }
  }

  const projectName = metadata?.name || 'Cornerstone Project';
  const projectDescription = metadata?.description || 'No description available';
  const projectImage = metadata?.image 
    ? resolveImageUri(metadata.image)
    : 'https://images.unsplash.com/photo-1501183638710-841dd1904471?w=600&q=60&auto=format&fit=crop';

  // Truncate description to 100 characters
  const truncatedDescription = projectDescription.length > 100 
    ? projectDescription.substring(0, 100) + '...'
    : projectDescription;

  return (
    <div
      onClick={() => navigate(`/projects/${project.address}`)}
      className="group cursor-pointer bg-gradient-to-b from-[#8B7355] to-[#6B5835] p-1 hover:from-[#9B8365] hover:to-[#7B6845] transition-all"
    >
      <div className="bg-[#D2B48C] border-4 border-[#654321] overflow-hidden shadow-[4px_4px_0px_0px_rgba(0,0,0,0.3)] group-hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,0.3)] transition-all group-hover:-translate-y-1">
        {/* Project Image */}
        <div className="relative h-48 w-full overflow-hidden border-b-4 border-[#654321] bg-[#8B7355]">
          {!imageLoaded && (
            <div className="absolute inset-0 flex items-center justify-center bg-[#8B7355]">
              <Loader2 className="w-8 h-8 animate-spin text-[#D2B48C]" />
            </div>
          )}
          <img
            src={projectImage}
            alt={projectName}
            className={`h-full w-full object-cover transition-all duration-300 ${
              imageLoaded ? 'opacity-100 group-hover:scale-105' : 'opacity-0'
            }`}
            onLoad={() => setImageLoaded(true)}
            onError={() => setImageLoaded(true)}
          />
          {/* Status Badge Overlay */}
          <div className="absolute top-3 right-3">
            <Badge className={`rounded-none border-4 px-3 py-1 text-xs font-bold uppercase tracking-[0.2em] shadow-[2px_2px_0_rgba(0,0,0,0.25)] ${statusBadge.color}`}>
              {statusBadge.text}
            </Badge>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Project Name */}
          <div>
            <h3 className="text-xl font-bold text-[#2D1B00] mb-2 line-clamp-1 [text-shadow:_1px_1px_0_rgb(255_255_255_/_40%)]">
              {projectName.toUpperCase()}
            </h3>
            <p className="text-sm text-[#5D4E37] line-clamp-2 leading-relaxed">
              {truncatedDescription}
            </p>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-3 gap-2">
            {/* Total Raised */}
            <div className="bg-gradient-to-b from-[#F8E3B5] to-[#E8D3A5] border-2 border-[#654321] p-3 text-center">
              <div className="flex justify-center mb-1">
                <div className="flex h-6 w-6 items-center justify-center rounded border-2 border-[#654321] bg-[#FFD700]">
                  <TrendingUp className="h-3 w-3 text-[#2D1B00]" />
                </div>
              </div>
              <p className="text-[0.6rem] font-bold uppercase tracking-wider text-[#5D4E37] mb-1">
                Raised
              </p>
              <p className="text-sm font-bold text-[#2D1B00]">
                {totalRaised.toLocaleString()}
              </p>
            </div>

            {/* Supporters */}
            <div className="bg-gradient-to-b from-[#F8E3B5] to-[#E8D3A5] border-2 border-[#654321] p-3 text-center">
              <div className="flex justify-center mb-1">
                <div className="flex h-6 w-6 items-center justify-center rounded border-2 border-[#654321] bg-[#5599FF]">
                  <Users className="h-3 w-3 text-white" />
                </div>
              </div>
              <p className="text-[0.6rem] font-bold uppercase tracking-wider text-[#5D4E37] mb-1">
                Backers
              </p>
              <p className="text-sm font-bold text-[#2D1B00]">
                {supportersCount}
              </p>
            </div>

            {/* Current Phase */}
            <div className="bg-gradient-to-b from-[#F8E3B5] to-[#E8D3A5] border-2 border-[#654321] p-3 text-center">
              <div className="flex justify-center mb-1">
                <div className="flex h-6 w-6 items-center justify-center rounded border-2 border-[#654321] bg-[#55AA55]">
                  <Target className="h-3 w-3 text-white" />
                </div>
              </div>
              <p className="text-[0.6rem] font-bold uppercase tracking-wider text-[#5D4E37] mb-1">
                Phase
              </p>
              <p className="text-sm font-bold text-[#2D1B00]">
                {project.projectState?.currentPhase !== undefined 
                  ? project.projectState.currentPhase + 1 
                  : 0}
              </p>
            </div>
          </div>

          {/* View Details Button */}
          <button
            className="w-full py-3 px-4 bg-[#5599FF] hover:bg-[#4488EE] text-white font-bold text-sm uppercase tracking-wider border-4 border-[#2D5788] shadow-[3px_3px_0px_0px_rgba(0,0,0,0.3)] transition-all group-hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,0.3)] active:translate-y-1 active:shadow-[1px_1px_0px_0px_rgba(0,0,0,0.3)]"
          >
            View Details →
          </button>
        </div>
      </div>
    </div>
  );
};