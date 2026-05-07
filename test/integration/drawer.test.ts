/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { Drawer, type DrawerState } from '../../src/drawer';

describe('Drawer', () => {
  let host: HTMLElement;
  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
  });

  it('starts in peek state', () => {
    const d = new Drawer(host);
    expect(d.state).toBe<DrawerState>('peek');
    expect(host.querySelector('.jigsaw-drawer')).not.toBeNull();
  });

  it('expand() goes peek->half', () => {
    const d = new Drawer(host);
    d.expand();
    expect(d.state).toBe<DrawerState>('half');
  });

  it('expand() from half goes to full', () => {
    const d = new Drawer(host);
    d.expand();
    d.expand();
    expect(d.state).toBe<DrawerState>('full');
  });

  it('expand() from full stays at full', () => {
    const d = new Drawer(host);
    d.expand();
    d.expand();
    d.expand();
    expect(d.state).toBe<DrawerState>('full');
  });

  it('collapse() goes full->half->peek', () => {
    const d = new Drawer(host);
    d.expand();
    d.expand();
    d.collapse();
    expect(d.state).toBe<DrawerState>('half');
    d.collapse();
    expect(d.state).toBe<DrawerState>('peek');
  });

  it('collapse() from peek stays at peek', () => {
    const d = new Drawer(host);
    d.collapse();
    expect(d.state).toBe<DrawerState>('peek');
  });

  it('setContent replaces drawer body', () => {
    const d = new Drawer(host);
    const content = document.createElement('div');
    content.id = 'first-content';
    d.setContent(content);
    expect(host.querySelector('#first-content')).not.toBeNull();

    const next = document.createElement('div');
    next.id = 'second-content';
    d.setContent(next);
    expect(host.querySelector('#first-content')).toBeNull();
    expect(host.querySelector('#second-content')).not.toBeNull();
  });

  it('handle click expands from peek, collapses otherwise', () => {
    const d = new Drawer(host);
    const handle = host.querySelector('.jigsaw-drawer-handle') as HTMLElement;
    handle.click();
    expect(d.state).toBe<DrawerState>('half');
    handle.click();
    expect(d.state).toBe<DrawerState>('peek');
  });

  it('emits change events on state transitions', () => {
    const d = new Drawer(host);
    const states: DrawerState[] = [];
    d.on('change', (s) => states.push(s));
    d.expand();
    d.expand();
    d.collapse();
    expect(states).toEqual(['half', 'full', 'half']);
  });

  it('on returns an unsubscribe that stops further notifications', () => {
    const d = new Drawer(host);
    const states: DrawerState[] = [];
    const off = d.on('change', (s) => states.push(s));
    d.expand();
    off();
    d.expand();
    expect(states).toEqual(['half']);
  });

  it('updates root class on transition', () => {
    const d = new Drawer(host);
    expect(host.querySelector('.drawer-peek')).not.toBeNull();
    d.expand();
    expect(host.querySelector('.drawer-half')).not.toBeNull();
    expect(host.querySelector('.drawer-peek')).toBeNull();
    d.expand();
    expect(host.querySelector('.drawer-full')).not.toBeNull();
  });
});
