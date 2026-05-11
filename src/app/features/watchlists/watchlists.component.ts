import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { TooltipModule } from 'primeng/tooltip';
import { ShareRole, Watchlist, WatchlistService, WatchlistShare } from '../../core/services/watchlist.service';

@Component({
  selector: 'app-watchlists',
  imports: [CommonModule, FormsModule, ButtonModule, TooltipModule],
  template: `
    <div class="watchlist-index-page">
      <section class="watchlist-header">
        <div>
          <span class="eyebrow">Watchlists</span>
          <h1>Stock decks</h1>
          <p>Choose a watchlist to open its dedicated stocks page.</p>
        </div>
        <button class="btn-primary" type="button" (click)="showCreateDialog.set(true)">
          <i class="pi pi-plus"></i>
          New Watchlist
        </button>
      </section>

      <section class="watchlist-stats" aria-label="Watchlist summary">
        <article class="stat-card">
          <span>Total Lists</span>
          <strong>{{ wlService.watchlists().length }}</strong>
        </article>
        <article class="stat-card">
          <span>Tracked Stocks</span>
          <strong>{{ totalStocks() }}</strong>
        </article>
        <article class="stat-card">
          <span>Owned</span>
          <strong>{{ ownedCount() }}</strong>
        </article>
        <article class="stat-card">
          <span>Shared</span>
          <strong>{{ sharedCount() }}</strong>
        </article>
      </section>

      <div class="create-overlay" *ngIf="showCreateDialog()" (click)="showCreateDialog.set(false)">
        <div class="create-dialog" (click)="$event.stopPropagation()">
          <span class="dialog-eyebrow">New collection</span>
          <h3>Create Watchlist</h3>
          <p>Name the stock deck you want to track.</p>
          <input
            type="text"
            [(ngModel)]="newWatchlistName"
            placeholder="e.g. AI Leaders, Dividend Core..."
            (keydown.enter)="createWatchlist()"
            autofocus />
          <div class="dialog-actions">
            <button class="btn-secondary" type="button" (click)="showCreateDialog.set(false)">Cancel</button>
            <button class="btn-primary" type="button" (click)="createWatchlist()" [disabled]="!newWatchlistName.trim()">Create</button>
          </div>
        </div>
      </div>

      <div class="share-overlay" *ngIf="showShareDialog()" (click)="closeShareDialog()">
        <div class="share-dialog" (click)="$event.stopPropagation()">
          <div class="share-dialog-header">
            <div>
              <span class="dialog-eyebrow">Collaborators</span>
              <h3>Share Watchlist</h3>
              <p>{{ activeShareWatchlist()?.name }}</p>
            </div>
            <button class="icon-btn" type="button" (click)="closeShareDialog()" aria-label="Close share dialog">
              <i class="pi pi-times"></i>
            </button>
          </div>

          <div class="share-form">
            <input
              type="email"
              [(ngModel)]="shareEmail"
              placeholder="Collaborator email"
              (keydown.enter)="submitShare()"
              [disabled]="shareLoading()" />
            <select [(ngModel)]="shareRole" [disabled]="shareLoading()">
              <option value="viewer">Viewer</option>
              <option value="editor">Editor</option>
            </select>
            <button class="btn-primary" type="button" (click)="submitShare()" [disabled]="shareLoading() || !shareEmail.trim()">
              <i class="pi pi-share-alt"></i>
              Share
            </button>
          </div>

          <p class="share-message success" *ngIf="shareMessage()">{{ shareMessage() }}</p>
          <p class="share-message error" *ngIf="shareError()">{{ shareError() }}</p>

          <div class="collaborators">
            <h4>Current access</h4>
            <div class="collaborator-empty" *ngIf="wlService.shares().length === 0 && !shareLoading()">
              No collaborators yet.
            </div>
            <div class="collaborator-row" *ngFor="let share of wlService.shares()">
              <div class="collaborator-info">
                <span class="collaborator-email">{{ share.shared_with_email || 'Account user' }}</span>
                <span class="collaborator-role">Can {{ share.role === 'editor' ? 'edit' : 'view' }}</span>
              </div>
              <select
                [ngModel]="share.role"
                (ngModelChange)="changeShareRole(share, $event)"
                [disabled]="shareLoading()">
                <option value="viewer">Viewer</option>
                <option value="editor">Editor</option>
              </select>
              <button class="icon-btn danger" type="button" (click)="revokeShare(share)" [disabled]="shareLoading()" pTooltip="Revoke access" tooltipPosition="top">
                <i class="pi pi-trash"></i>
              </button>
            </div>
          </div>
        </div>
      </div>

      @if (!wlService.loading() && wlService.watchlists().length === 0) {
        <section class="empty-state">
          <div class="empty-icon"><i class="pi pi-bookmark"></i></div>
          <h2>No watchlists yet</h2>
          <p>Create your first watchlist to start tracking stocks in a focused stock deck.</p>
          <button class="btn-primary" type="button" (click)="showCreateDialog.set(true)">
            <i class="pi pi-plus"></i>
            Create Watchlist
          </button>
        </section>
      }

      @if (wlService.watchlists().length > 0) {
        <section class="watchlist-table-shell" aria-label="Your watchlists">
          <div class="watchlist-table-wrap">
            <table class="watchlist-table">
              <colgroup>
                <col class="col-drag">
                <col class="col-name">
                <col class="col-role">
                <col class="col-date">
                <col class="col-date">
                <col class="col-stocks">
                <col class="col-actions">
              </colgroup>
              <thead>
                <tr>
                  <th class="drag-column" aria-label="Reorder"></th>
                  <th class="name-column">Watchlist Name</th>
                  <th class="role-column">Access Role</th>
                  <th class="date-column">Created On</th>
                  <th class="date-column">Updated On</th>
                  <th class="stocks-column">#Stocks</th>
                  <th class="actions-column">Actions</th>
                </tr>
              </thead>
              <tbody>
                @for (wl of wlService.watchlists(); track wl.id; let i = $index) {
                  <tr
                    class="watchlist-row"
                    [class.dragging]="dragIndex === i"
                    [class.drag-over]="dragOverIndex === i"
                    draggable="true"
                    (dragstart)="onDragStart(i, $event)"
                    (dragover)="onDragOver(i, $event)"
                    (drop)="onDrop(i, $event)"
                    (dragend)="onDragEnd()"
                    (dblclick)="openWatchlist(wl)">
                    <td class="drag-column" data-label="Order">
                      <span class="drag-handle" pTooltip="Drag to reorder" tooltipPosition="top">
                        <i class="pi pi-bars"></i>
                      </span>
                    </td>
                    <td class="name-column" data-label="Watchlist Name">
                      @if (editingId !== wl.id) {
                        <a class="name-button" [href]="'/watchlists/' + wl.id" (click)="openWatchlistFromLink(wl, $event)">
                          <span class="name-mark">{{ getWatchlistInitials(wl.name) }}</span>
                          <span class="name-copy">
                            <strong>{{ wl.name }}</strong>
                          </span>
                        </a>
                      } @else {
                        <input
                          class="wl-rename-input"
                          [(ngModel)]="editingName"
                          (click)="$event.stopPropagation()"
                          (keydown.enter)="saveRename(wl)"
                          (keydown.escape)="editingId = ''"
                          (blur)="saveRename(wl)"
                          autofocus />
                      }
                    </td>
                    <td data-label="Access Role">
                      <span class="role-badge" [class.viewer]="wl.access_role === 'viewer'" [class.editor]="wl.access_role === 'editor'">
                        {{ getAccessRoleLabel(wl) }}
                      </span>
                    </td>
                    <td data-label="Created On">{{ getCreatedDate(wl) }}</td>
                    <td data-label="Updated On">{{ getUpdatedDate(wl) }}</td>
                    <td class="stocks-column" data-label="#Stocks">
                      <span class="stock-count">{{ wl.item_count || 0 }}</span>
                    </td>
                    <td class="actions-column" data-label="Actions">
                      <div class="row-actions">
                        @if (isOwner(wl)) {
                          <button class="icon-btn share-action" type="button" (click)="openShareDialog(wl); $event.stopPropagation()" pTooltip="Share" tooltipPosition="top">
                            <i class="pi pi-share-alt"></i>
                          </button>
                          <button class="icon-btn" type="button" (click)="startRename(wl); $event.stopPropagation()" pTooltip="Rename" tooltipPosition="top">
                            <i class="pi pi-pencil"></i>
                          </button>
                          <button class="icon-btn danger" type="button" (click)="confirmDelete(wl); $event.stopPropagation()" pTooltip="Delete" tooltipPosition="top">
                            <i class="pi pi-trash"></i>
                          </button>
                        }
                      </div>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </section>
      }
    </div>
  `,
  styles: [`
    .watchlist-index-page {
      min-height: calc(100vh - 56px);
      padding: 1.25rem;
      display: flex;
      flex-direction: column;
      gap: 0.9rem;
      background: linear-gradient(180deg, rgba(15, 23, 42, 0.16), transparent 34%);
    }

    .watchlist-header {
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: 1rem;
      padding: 1rem 1.1rem;
      border: 1px solid rgba(148, 163, 184, 0.14);
      border-radius: 18px;
      background: rgba(15, 23, 42, 0.58);
    }

    .watchlist-header h1 {
      margin: 0.1rem 0 0.2rem;
      color: #f8fafc;
      font-size: clamp(1.45rem, 2.8vw, 2.15rem);
      line-height: 1;
      letter-spacing: -0.045em;
    }

    .watchlist-header p {
      margin: 0;
      color: #94a3b8;
      font-size: 0.9rem;
    }

    .eyebrow,
    .dialog-eyebrow {
      color: #38bdf8;
      font-size: 0.7rem;
      font-weight: 900;
      letter-spacing: 0.14em;
      text-transform: uppercase;
    }

    .btn-primary {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.4rem;
      border: none;
      border-radius: 999px;
      color: #fff;
      font-size: 0.78rem;
      font-weight: 800;
      cursor: pointer;
      font-family: inherit;
      background: linear-gradient(135deg, #38bdf8, #2563eb);
      box-shadow: 0 10px 24px rgba(37, 99, 235, 0.22);
      white-space: nowrap;
    }

    .btn-primary { padding: 0.66rem 0.95rem; }
    .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; box-shadow: none; }
    .btn-primary:hover { transform: translateY(-1px); box-shadow: 0 14px 28px rgba(37, 99, 235, 0.28); }

    .watchlist-stats {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 0.65rem;
    }

    .stat-card {
      padding: 0.72rem 0.85rem;
      border: 1px solid rgba(148, 163, 184, 0.12);
      border-radius: 14px;
      background: rgba(15, 23, 42, 0.48);
    }

    .stat-card span {
      display: block;
      color: #94a3b8;
      font-size: 0.66rem;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .stat-card strong {
      display: block;
      margin-top: 0.2rem;
      color: #f8fafc;
      font-size: 1.18rem;
      letter-spacing: -0.035em;
    }

    .watchlist-table-shell {
      min-height: 0;
      border: 1px solid rgba(148, 163, 184, 0.14);
      border-radius: 18px;
      background: rgba(15, 23, 42, 0.56);
      overflow: hidden;
    }

    .watchlist-table-wrap { overflow-x: auto; }
    .watchlist-table {
      width: 100%;
      border-collapse: separate;
      border-spacing: 0;
      table-layout: fixed;
      min-width: 980px;
    }

    .col-drag { width: 3%; }
    .col-name { width: 30%; }
    .col-role { width: 15%; }
    .col-date { width: 16%; }
    .col-stocks { width: 10%; }
    .col-actions { width: 10%; }

    .watchlist-table th {
      padding: 0.65rem 0.8rem;
      color: #64748b;
      font-size: 0.68rem;
      font-weight: 900;
      letter-spacing: 0.08em;
      text-align: left;
      text-transform: uppercase;
      border-bottom: 1px solid rgba(148, 163, 184, 0.12);
      background: rgba(2, 6, 23, 0.18);
    }

    .watchlist-table td {
      padding: 0.72rem 0.8rem;
      color: #cbd5e1;
      font-size: 0.86rem;
      border-bottom: 1px solid rgba(148, 163, 184, 0.08);
      vertical-align: middle;
    }

    .watchlist-row {
      transition: background 0.14s ease, box-shadow 0.14s ease;
    }

    .watchlist-row:hover,
    .watchlist-row:focus-within {
      background: rgba(56, 189, 248, 0.055);
    }

    .watchlist-row.dragging { opacity: 0.5; }
    .watchlist-row.drag-over { box-shadow: inset 3px 0 0 #38bdf8; }
    .drag-column { color: #64748b; }
    .drag-handle { cursor: grab; display: inline-flex; padding: 0.25rem; }
    .numeric-column { text-align: right; }
    .stocks-column {
      min-width: 6.5rem;
      text-align: center !important;
    }
    .actions-column {
      min-width: 9.5rem;
      text-align: center !important;
    }

    .name-button {
      display: inline-flex;
      align-items: center;
      gap: 0.65rem;
      width: 100%;
      padding: 0;
      border: 0;
      background: transparent;
      color: inherit;
      text-align: left;
      cursor: pointer;
      font-family: inherit;
      text-decoration: none;
    }

    .name-button:hover strong,
    .name-button:focus-visible strong { color: #7dd3fc; }
    .name-button:focus-visible { outline: 2px solid rgba(56, 189, 248, 0.35); outline-offset: 4px; border-radius: 10px; }

    .name-mark {
      width: 2rem;
      height: 2rem;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex: 0 0 auto;
      border-radius: 10px;
      color: #dff6ff;
      font-size: 0.72rem;
      font-weight: 900;
      background: rgba(14, 116, 144, 0.28);
      border: 1px solid rgba(125, 211, 252, 0.18);
    }

    .name-copy { min-width: 0; display: flex; flex-direction: column; gap: 0.12rem; }
    .name-copy strong {
      color: #f8fafc;
      font-size: 0.92rem;
      line-height: 1.15;
      transition: color 0.14s ease;
    }

    .role-badge {
      display: inline-flex;
      width: fit-content;
      padding: 0.22rem 0.55rem;
      border-radius: 999px;
      background: rgba(59, 130, 246, 0.12);
      color: #60a5fa;
      font-size: 0.64rem;
      font-weight: 900;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      white-space: nowrap;
    }

    .role-badge.viewer { background: rgba(148, 163, 184, 0.14); color: #94a3b8; }
    .role-badge.editor { background: rgba(16, 185, 129, 0.12); color: #34d399; }
    .stock-count { color: #f8fafc; font-weight: 800; }
    .row-actions { display: inline-flex; align-items: center; justify-content: center; gap: 0.45rem; }

    .icon-btn {
      width: 1.9rem;
      height: 1.9rem;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border: 1px solid rgba(148, 163, 184, 0.14);
      border-radius: 999px;
      background: rgba(15, 23, 42, 0.68);
      color: #94a3b8;
      cursor: pointer;
      font-family: inherit;
    }

    .icon-btn:hover { color: #f8fafc; border-color: rgba(96, 165, 250, 0.35); }
    .icon-btn.share-action:hover { color: #7dd3fc; }
    .icon-btn.danger:hover { color: #f87171; border-color: rgba(248, 113, 113, 0.32); }

    .wl-rename-input {
      width: 100%;
      min-width: 12rem;
      padding: 0.5rem 0.6rem;
      border: 1px solid rgba(96, 165, 250, 0.55);
      border-radius: 10px;
      background: rgba(15, 23, 42, 0.82);
      color: #f8fafc;
      font-size: 0.9rem;
      font-weight: 800;
      font-family: inherit;
      outline: none;
    }

    .create-overlay {
      position: fixed;
      inset: 0;
      z-index: 1100;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1rem;
      background: rgba(2, 6, 23, 0.72);
      backdrop-filter: blur(10px);
    }

    .share-overlay {
      position: fixed;
      inset: 0;
      z-index: 1100;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1rem;
      background: rgba(2, 6, 23, 0.72);
      backdrop-filter: blur(10px);
    }

    .create-dialog {
      width: min(460px, 100%);
      padding: 1.4rem;
      border: 1px solid rgba(96, 165, 250, 0.22);
      border-radius: 18px;
      background: linear-gradient(145deg, rgba(15, 23, 42, 0.98), rgba(15, 23, 42, 0.9));
      box-shadow: 0 30px 90px rgba(2, 6, 23, 0.56);
    }

    .share-dialog {
      width: min(640px, 100%);
      max-height: min(78vh, 720px);
      overflow: auto;
      padding: 1.4rem;
      border: 1px solid rgba(96, 165, 250, 0.22);
      border-radius: 18px;
      background: linear-gradient(145deg, rgba(15, 23, 42, 0.98), rgba(15, 23, 42, 0.9));
      box-shadow: 0 30px 90px rgba(2, 6, 23, 0.56);
    }

    .share-dialog-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 1rem;
      margin-bottom: 1rem;
    }

    .share-dialog-header h3 {
      margin: 0.25rem 0 0.2rem;
      color: #f8fafc;
      font-size: 1.25rem;
    }

    .share-dialog-header p {
      margin: 0;
      color: #94a3b8;
      font-size: 0.9rem;
    }

    .share-form {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 120px auto;
      gap: 0.65rem;
      margin-bottom: 0.8rem;
    }

    .share-form input,
    .share-form select,
    .collaborator-row select {
      min-width: 0;
      padding: 0.72rem 0.8rem;
      border: 1px solid rgba(148, 163, 184, 0.18);
      border-radius: 12px;
      background: rgba(15, 23, 42, 0.78);
      color: #f8fafc;
      font-size: 0.88rem;
      font-family: inherit;
      outline: none;
    }

    .share-form input:focus,
    .share-form select:focus,
    .collaborator-row select:focus {
      border-color: rgba(56, 189, 248, 0.55);
    }

    .share-message {
      margin: 0.7rem 0;
      font-size: 0.82rem;
      font-weight: 700;
    }

    .share-message.success { color: #34d399; }
    .share-message.error { color: #f87171; }

    .collaborators {
      margin-top: 1rem;
      padding-top: 1rem;
      border-top: 1px solid rgba(148, 163, 184, 0.12);
    }

    .collaborators h4 {
      margin: 0 0 0.7rem;
      color: #cbd5e1;
      font-size: 0.85rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .collaborator-empty {
      padding: 0.8rem;
      border: 1px dashed rgba(148, 163, 184, 0.18);
      border-radius: 12px;
      color: #64748b;
      font-size: 0.84rem;
      text-align: center;
    }

    .collaborator-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 120px auto;
      align-items: center;
      gap: 0.65rem;
      padding: 0.65rem 0;
      border-bottom: 1px solid rgba(148, 163, 184, 0.08);
    }

    .collaborator-info {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 0.12rem;
    }

    .collaborator-email {
      color: #f8fafc;
      font-size: 0.9rem;
      font-weight: 800;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .collaborator-role {
      color: #64748b;
      font-size: 0.74rem;
      font-weight: 700;
    }

    .create-dialog h3 { margin: 0.3rem 0 0.25rem; color: #f8fafc; font-size: 1.25rem; }
    .create-dialog p { margin: 0 0 1rem; color: #94a3b8; font-size: 0.9rem; }
    .create-dialog input {
      width: 100%;
      padding: 0.8rem 0.9rem;
      border: 1px solid rgba(148, 163, 184, 0.18);
      border-radius: 12px;
      background: rgba(15, 23, 42, 0.78);
      color: #f8fafc;
      font-size: 0.95rem;
      font-family: inherit;
      outline: none;
    }

    .create-dialog input:focus { border-color: rgba(56, 189, 248, 0.55); }
    .dialog-actions { display: flex; justify-content: flex-end; gap: 0.7rem; margin-top: 1rem; }
    .btn-secondary {
      padding: 0.66rem 0.95rem;
      border: 1px solid rgba(148, 163, 184, 0.18);
      border-radius: 999px;
      background: rgba(15, 23, 42, 0.68);
      color: #cbd5e1;
      cursor: pointer;
      font-weight: 800;
      font-family: inherit;
    }

    .empty-state {
      display: flex;
      min-height: 22rem;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 0.75rem;
      text-align: center;
      border: 1px solid rgba(148, 163, 184, 0.14);
      border-radius: 18px;
      background: rgba(15, 23, 42, 0.5);
      color: #cbd5e1;
    }

    .empty-icon {
      width: 3.5rem;
      height: 3.5rem;
      display: grid;
      place-items: center;
      border-radius: 16px;
      color: #38bdf8;
      background: rgba(56, 189, 248, 0.12);
    }

    .empty-state h2 { margin: 0; color: #f8fafc; }
    .empty-state p { margin: 0; color: #94a3b8; max-width: 34rem; }

    @media (max-width: 900px) {
      .watchlist-header { align-items: flex-start; flex-direction: column; }
      .watchlist-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }

    @media (max-width: 680px) {
      .watchlist-index-page { padding: 0.75rem; }
      .watchlist-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .watchlist-table { min-width: 0; }
      .watchlist-table thead { display: none; }
      .watchlist-table,
      .watchlist-table tbody,
      .watchlist-table tr,
      .watchlist-table td { display: block; width: 100%; }
      .watchlist-row { padding: 0.7rem; border-bottom: 1px solid rgba(148, 163, 184, 0.12); }
      .watchlist-table td { padding: 0.35rem 0; border-bottom: 0; display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
      .watchlist-table td::before { content: attr(data-label); color: #64748b; font-size: 0.66rem; font-weight: 900; letter-spacing: 0.08em; text-transform: uppercase; }
      .name-column { display: block !important; }
      .name-column::before { display: none; }
      .name-copy small { max-width: 100%; white-space: normal; }
      .drag-column { display: none !important; }
      .numeric-column,
      .stocks-column,
      .actions-column { text-align: left; }
      .row-actions { width: 100%; justify-content: flex-end; }
      .share-form,
      .collaborator-row { grid-template-columns: 1fr; }
    }
  `]

})
export class WatchlistsComponent implements OnInit {
  readonly wlService = inject(WatchlistService);
  private router = inject(Router);

  showCreateDialog = signal(false);
  showShareDialog = signal(false);
  shareLoading = signal(false);
  shareMessage = signal<string | null>(null);
  shareError = signal<string | null>(null);
  activeShareWatchlist = signal<Watchlist | null>(null);
  newWatchlistName = '';
  shareEmail = '';
  shareRole: ShareRole = 'viewer';
  editingId = '';
  editingName = '';
  dragIndex: number | null = null;
  dragOverIndex: number | null = null;

  totalStocks = computed(() => this.wlService.watchlists().reduce((total, wl) => total + (wl.item_count || 0), 0));
  ownedCount = computed(() => this.wlService.watchlists().filter(wl => wl.access_role === 'owner').length);
  sharedCount = computed(() => this.wlService.watchlists().filter(wl => wl.access_role !== 'owner').length);

  ngOnInit(): void {
    this.wlService.loadWatchlists();
  }

  openWatchlist(wl: Watchlist): void {
    this.selectWatchlistForNavigation(wl);
    this.router.navigate(['/watchlists', wl.id]);
  }

  openWatchlistFromLink(wl: Watchlist, event: MouseEvent): void {
    event.preventDefault();
    this.openWatchlist(wl);
  }

  selectWatchlistForNavigation(wl: Watchlist): void {
    this.wlService.selectWatchlist(wl);
  }

  async createWatchlist(): Promise<void> {
    const name = this.newWatchlistName.trim();
    if (!name) return;

    const created = await this.wlService.createWatchlist(name);
    this.newWatchlistName = '';
    this.showCreateDialog.set(false);

    if (created) {
      this.openWatchlist(created);
    }
  }

  startRename(wl: Watchlist): void {
    this.editingId = wl.id;
    this.editingName = wl.name;
  }

  async saveRename(wl: Watchlist): Promise<void> {
    const name = this.editingName.trim();
    if (name && name !== wl.name) {
      await this.wlService.renameWatchlist(wl.id, name);
    }
    this.editingId = '';
  }

  async confirmDelete(wl: Watchlist): Promise<void> {
    if (confirm(`Delete "${wl.name}" and all its stocks?`)) {
      await this.wlService.deleteWatchlist(wl.id);
    }
  }

  async openShareDialog(wl: Watchlist): Promise<void> {
    if (!this.isOwner(wl)) return;

    this.activeShareWatchlist.set(wl);
    this.shareEmail = '';
    this.shareRole = 'viewer';
    this.shareMessage.set(null);
    this.shareError.set(null);
    this.showShareDialog.set(true);
    this.shareLoading.set(true);

    try {
      await this.wlService.loadShares(wl.id);
    } catch (error) {
      this.shareError.set(this.getErrorMessage(error, 'Unable to load collaborators.'));
    } finally {
      this.shareLoading.set(false);
    }
  }

  closeShareDialog(): void {
    this.showShareDialog.set(false);
    this.activeShareWatchlist.set(null);
    this.shareMessage.set(null);
    this.shareError.set(null);
  }

  async submitShare(): Promise<void> {
    const wl = this.activeShareWatchlist();
    const email = this.shareEmail.trim();
    if (!wl || !email || !this.isOwner(wl)) return;

    this.shareLoading.set(true);
    this.shareMessage.set(null);
    this.shareError.set(null);

    try {
      await this.wlService.shareWatchlist(wl.id, email, this.shareRole);
      this.shareEmail = '';
      this.shareRole = 'viewer';
      this.shareMessage.set('Collaborator access updated.');
    } catch (error) {
      this.shareError.set(this.getErrorMessage(error, 'Unable to share this watchlist.'));
    } finally {
      this.shareLoading.set(false);
    }
  }

  async changeShareRole(share: WatchlistShare, role: ShareRole): Promise<void> {
    if (share.role === role) return;

    this.shareLoading.set(true);
    this.shareMessage.set(null);
    this.shareError.set(null);

    try {
      await this.wlService.updateShareRole(share.id, role);
      this.shareMessage.set('Collaborator role updated.');
    } catch (error) {
      this.shareError.set(this.getErrorMessage(error, 'Unable to update collaborator access.'));
    } finally {
      this.shareLoading.set(false);
    }
  }

  async revokeShare(share: WatchlistShare): Promise<void> {
    if (!confirm(`Revoke access for ${share.shared_with_email || 'this collaborator'}?`)) return;

    this.shareLoading.set(true);
    this.shareMessage.set(null);
    this.shareError.set(null);

    try {
      await this.wlService.revokeShare(share.id);
      this.shareMessage.set('Collaborator access revoked.');
    } catch (error) {
      this.shareError.set(this.getErrorMessage(error, 'Unable to revoke collaborator access.'));
    } finally {
      this.shareLoading.set(false);
    }
  }

  isOwner(wl: Watchlist): boolean {
    return wl.access_role === 'owner';
  }

  getAccessRoleLabel(wl: Watchlist): string {
    switch (wl.access_role) {
      case 'owner':
        return 'Owner';
      case 'editor':
        return 'Editor';
      case 'viewer':
        return 'Viewer';
    }
  }

  getWatchlistInitials(name: string): string {
    const initials = name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(part => part[0]?.toUpperCase() ?? '')
      .join('');
    return initials || 'WL';
  }

  getUpdatedDate(wl: Watchlist): string {
    const date = new Date(wl.updated_at || wl.created_at);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  getCreatedDate(wl: Watchlist): string {
    const date = new Date(wl.created_at);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  private getErrorMessage(error: unknown, fallback: string): string {
    return error instanceof Error ? error.message : fallback;
  }

  onDragStart(index: number, event: DragEvent): void {
    this.dragIndex = index;
    event.dataTransfer?.setData('text/plain', String(index));
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  }

  onDragOver(index: number, event: DragEvent): void {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    this.dragOverIndex = index;
  }

  onDrop(index: number, event: DragEvent): void {
    event.preventDefault();
    if (this.dragIndex === null || this.dragIndex === index) return;

    const watchlists = [...this.wlService.watchlists()];
    const [moved] = watchlists.splice(this.dragIndex, 1);
    watchlists.splice(index, 0, moved);

    this.wlService.watchlists.set(watchlists);
    this.wlService.saveOrder(watchlists.map((w, i) => ({ id: w.id, sort_order: i })));
    this.dragIndex = null;
    this.dragOverIndex = null;
  }

  onDragEnd(): void {
    this.dragIndex = null;
    this.dragOverIndex = null;
  }
}
