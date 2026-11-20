import React from 'react';
import {HeroSection} from '../../components/home/HeroSection';
import {ServiceCards} from '../../components/home/ServiceCards';
import {OfflineInfo} from '../../components/home/OfflineInfo';
import {CommonQuestions} from '../../components/home/CommonQuestions';
import {KnowledgeCta} from '../../components/home/KnowledgeCta';

/**
 * Landing page: hero, five essential services, offline information, the 11 common farming questions and one call to action.
 * Detailed learning content lives in Farming Knowledge & Guides (/guides); see components/knowledge/KnowledgeResources.
 */
export const HomePage: React.FC = () => (
  <div className="space-y-10 pb-4 md:space-y-12">
    <HeroSection />
    <ServiceCards />
    <OfflineInfo />
    <CommonQuestions />
    <KnowledgeCta />
  </div>
);
