import React from 'react';
import {createRoot} from 'react-dom/client';
import App from './App';
import './styles.css';
class AppBoundary extends React.Component<{children:React.ReactNode},{failed:boolean}>{
  state={failed:false};
  static getDerivedStateFromError(){return{failed:true};}
  render(){return this.state.failed?<main className="loading" role="alert"><h1>课程暂时未能加载</h1><p>网站可能刚刚更新，刷新后即可重新加载。已保存的学习记录不会丢失。</p><button className="outline-button" onClick={()=>location.reload()}>刷新页面</button></main>:this.props.children;}
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><AppBoundary><App/></AppBoundary></React.StrictMode>);
