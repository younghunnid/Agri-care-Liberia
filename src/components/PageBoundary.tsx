import React, {Component, Suspense, useEffect} from 'react';
import {Link, useLocation} from 'react-router-dom';

/** Keep navigation usable if a route fails to load, including an uncached page on an offline device. */
class PageBoundary extends Component<{children: React.ReactNode}, {failed: boolean}> {
  state = {failed: false};
  static getDerivedStateFromError() { return {failed: true}; }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <section className="max-w-xl mx-auto px-4 py-10 space-y-4" role="alert">
        <h1 className="font-display text-2xl font-extrabold">This page could not open</h1>
        <p>Your saved work stays on this phone. Check your connection and try again. Bundled farming guidance is available after the app has finished downloading for offline use.</p>
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={() => window.location.reload()} className="agri-button">Try again</button>
          <Link to="/today" className="agri-button-secondary">My farm today</Link>
          <Link to="/guidance" className="agri-button-secondary">Planting and storage</Link>
        </div>
      </section>
    );
  }
}

const PageFocus: React.FC<{children: React.ReactNode}> = ({children}) => {
  const {pathname} = useLocation();
  useEffect(() => {
    const heading = document.querySelector<HTMLElement>('main h1');
    if (!heading) return;
    document.title = `${heading.textContent} | Agri-Advisory Liberia`;
    heading.tabIndex = -1;
    heading.focus({preventScroll: true});
  }, [pathname]);
  return children;
};

export const RouteContent: React.FC<{children: React.ReactNode}> = ({children}) => {
  const {pathname} = useLocation();
  return (
    <PageBoundary key={pathname}>
      <Suspense fallback={<p role="status" className="max-w-3xl mx-auto px-4 py-10 text-base font-semibold">Opening page… Your saved work stays on this phone.</p>}>
        <PageFocus>{children}</PageFocus>
      </Suspense>
    </PageBoundary>
  );
};
