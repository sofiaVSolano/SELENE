import Footer from "../components/Footer.jsx";
import Navbar from "../components/Navbar.jsx";
import SceneBackground from "../components/SceneBackground.jsx";
import CTA from "../components/landing/CTA.jsx";
import Features from "../components/landing/Features.jsx";
import Hero from "../components/landing/Hero.jsx";
import HowItWorks from "../components/landing/HowItWorks.jsx";
import StatusTicker from "../components/landing/StatusTicker.jsx";

export default function LandingPage() {
  return (
    <SceneBackground>
      <Navbar />
      <StatusTicker />
      <Hero />
      <Features />
      <HowItWorks />
      <CTA />
      <Footer />
    </SceneBackground>
  );
}
