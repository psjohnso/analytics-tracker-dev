// Data layer (CRUD) — extracted from index.html on 2026-05-22.
// Classic script: DataStore is a global shared with the rest of the app.
// Optimistic local updates to PROJECTS/TASKS with ArcGIS applyEdits persistence;
// falls back to local-only when the service has no editing enabled. Relies on
// globals defined elsewhere (PROJECTS, TASKS, ARCGIS_CONFIG, agolQuery/agolApplyEdits,
// localToAgolProject/Task, Auth, render, showToast, logStatusChange, markDataDirty…).

const DataStore = {
  // ── Projects ──────────────────────────────────────────────────────
  getAllProjects() { return PROJECTS; },
  getProject(id)  { return PROJECTS.find(function(p) { return p.objectId == id; }) || null; },

  async createProject(fields) {
    try {
      // Auto-assign project_number (the canonical PK in the new schema)
      if (!fields.project_number) fields.project_number = getNextProjectNumber();
      // Auto-set working_due to match original end date on creation
      if (fields.end && !fields.working_due) fields.working_due = fields.end;
      const attrs = localToAgolProject(fields);
      const result = await agolApplyEdits(ARCGIS_CONFIG.projectsUrl, {
        adds: [{ attributes: attrs }]
      });
      const addResult = (result.addResults || [])[0];
      if (!addResult || !addResult.success) throw new Error('Add failed: ' + JSON.stringify(addResult));
      // Build local project object; alias 'id' → project_number for consumer compat.
      const proj = Object.assign({ id: fields.project_number, objectId: addResult.objectId }, fields);
      PROJECTS.push(proj);
      markSynced('Project created');
      // Log initial status to history (FK is project_number)
      if (fields.status) logStatusChange(fields.project_number, fields.title, fields.status);
      return proj;
    } catch (err) {
      console.error('ArcGIS createProject failed:', err);
      showToast('Failed to create project: ' + err.message, 'error');
      if (!fields.project_number) fields.project_number = getNextProjectNumber();
      const tempOid = 'temp_' + Date.now();
      const proj = Object.assign({ id: fields.project_number, objectId: tempOid }, fields);
      PROJECTS.push(proj);
      markDirty();
      return proj;
    }
  },

  async updateProject(id, fields) {
    const i = PROJECTS.findIndex(function(p) { return p.objectId == id; });
    if (i < 0) return null;
    // Detect status change before applying
    const oldStatus = PROJECTS[i].status;
    const newStatus = fields.status;
    const statusChanged = newStatus && newStatus !== oldStatus;
    // Auto-set actual_end when status changes to Complete
    if (fields.status === 'Complete' && !fields.actual_end && !PROJECTS[i].actual_end) {
      const today = new Date();
      fields.actual_end = today.getFullYear() + '-' + String(today.getMonth()+1).padStart(2,'0') + '-' + String(today.getDate()).padStart(2,'0');
    }
    // 🎉 Celebrate the moment of completion (before the async network call
    // so the burst feels anchored to the click). Bigger burst for projects
    // since they're rarer than tasks.
    if (typeof fireConfetti === 'function' && newStatus === 'Complete' && oldStatus !== 'Complete') {
      fireConfetti({ count: 60 });
    }
    const oldTitle = PROJECTS[i].title;
    const newTitle = fields.title;
    const snapshot = Object.assign({}, PROJECTS[i]); // save snapshot for rollback
    Object.assign(PROJECTS[i], fields);
    // Tasks are linked to projects by project_number, so a title change
    // requires no task-side update — the link survives the rename
    // automatically. The cascades below are for tables that still carry
    // the title denormalized (allocations, time entries, status history).
    const objectId = PROJECTS[i].objectId;
    if (objectId) {
      try {
        const attrs = localToAgolProject(fields);
        attrs.ObjectId = objectId;
        await agolApplyEdits(ARCGIS_CONFIG.projectsUrl, {
          updates: [{ attributes: attrs }]
        });
        if (newTitle && newTitle !== oldTitle) {
          showLoadingOverlay('Renaming project across all records…');

          // Cascade rename to allocations
          const escapedOldTitle = oldTitle.replace(/'/g, "''");
          try {
            const allocFeatures = await agolQuery(ARCGIS_CONFIG.allocationsUrl, "project='" + escapedOldTitle + "'");
            if (allocFeatures.length > 0) {
              const allocUpdates = allocFeatures.map(function(f) {
                const oid = f.attributes.OBJECTID || f.attributes.ObjectId || f.attributes.objectid;
                return { attributes: { ObjectId: oid, project: newTitle } };
              });
              for (var ab = 0; ab < allocUpdates.length; ab += 100) {
                await agolApplyEdits(ARCGIS_CONFIG.allocationsUrl, { updates: allocUpdates.slice(ab, ab + 100) });
              }
              console.log('[Cascade] Renamed', allocFeatures.length, 'allocation records:', oldTitle, '→', newTitle);
            }
          } catch (err) { console.error('[Cascade] Failed to rename allocations:', err); }

          // Cascade rename to time entries
          try {
            const timeFeatures = await agolQuery(ARCGIS_CONFIG.timeEntriesUrl, "project='" + escapedOldTitle + "'");
            if (timeFeatures.length > 0) {
              const timeUpdates = timeFeatures.map(function(f) {
                const oid = f.attributes.OBJECTID || f.attributes.ObjectId || f.attributes.objectid;
                return { attributes: { ObjectId: oid, project: newTitle } };
              });
              for (var tb = 0; tb < timeUpdates.length; tb += 100) {
                await agolApplyEdits(ARCGIS_CONFIG.timeEntriesUrl, { updates: timeUpdates.slice(tb, tb + 100) });
              }
              console.log('[Cascade] Renamed', timeFeatures.length, 'time entries:', oldTitle, '→', newTitle);
            }
          } catch (err) { console.error('[Cascade] Failed to rename time entries:', err); }

          // Cascade rename to status history
          try {
            const histFeatures = await agolQuery(ARCGIS_CONFIG.statusHistoryUrl, "project_title='" + escapedOldTitle + "'");
            if (histFeatures.length > 0) {
              const histUpdates = histFeatures.map(function(f) {
                const oid = f.attributes.OBJECTID || f.attributes.ObjectId || f.attributes.objectid;
                return { attributes: { ObjectId: oid, project_title: newTitle } };
              });
              for (var hb = 0; hb < histUpdates.length; hb += 100) {
                await agolApplyEdits(ARCGIS_CONFIG.statusHistoryUrl, { updates: histUpdates.slice(hb, hb + 100) });
              }
              console.log('[Cascade] Renamed', histFeatures.length, 'status history records:', oldTitle, '→', newTitle);
            }
          } catch (err) { console.error('[Cascade] Failed to rename status history:', err); }

          // Update local time entries and status history arrays
          if (typeof TIME_ENTRIES !== 'undefined') {
            TIME_ENTRIES.forEach(function(e) { if (e.project === oldTitle) e.project = newTitle; });
          }
          STATUS_HISTORY.forEach(function(h) { if (h.project_title === oldTitle) h.project_title = newTitle; });

          // Reload resources data so allocations reflect new name (retry if AGOL lags)
          try {
            await reloadResourcesUntil(function() {
              if (!RESOURCES_DATA || !RESOURCES_DATA.people) return false;
              return !Object.keys(RESOURCES_DATA.people).some(function(nm) {
                return (RESOURCES_DATA.people[nm].allocations || []).some(function(a) { return a.project === oldTitle; });
              });
            }, 'project-rename');
          } catch(e) {}
          hideLoadingOverlay();
        }
        markSynced('Project updated');
        // Log status change to history
        if (statusChanged) logStatusChange(PROJECTS[i].id, PROJECTS[i].title, newStatus);

        // ── Cascade: cancel open tasks when project is canceled ──
        if (statusChanged && newStatus === 'Canceled') {
          var projNum = PROJECTS[i].project_number;
          var tasksToCancel = TASKS.filter(function(t) {
            return t.project_number != null && String(t.project_number) === String(projNum)
              && t.status !== 'Complete' && t.status !== 'Canceled';
          });
          if (tasksToCancel.length > 0) {
            var cancelUpdates = [];
            tasksToCancel.forEach(function(t) {
              t.status = 'Canceled';
              if (t.objectId) {
                cancelUpdates.push({ attributes: { ObjectId: t.objectId, status: 'Canceled' } });
              }
            });
            if (cancelUpdates.length > 0) {
              try {
                for (var ci2 = 0; ci2 < cancelUpdates.length; ci2 += 100) {
                  var batch = cancelUpdates.slice(ci2, ci2 + 100);
                  await agolApplyEdits(ARCGIS_CONFIG.tasksUrl, { updates: batch });
                }
                console.log('[Cascade] Canceled', cancelUpdates.length, 'tasks for project:', PROJECTS[i].title);
                showToast('Canceled ' + cancelUpdates.length + ' open task(s) for this project.', 'info');
              } catch (err2) {
                console.error('[Cascade] Failed to cancel tasks:', err2);
              }
            }
          }
        }
      } catch (err) {
        hideLoadingOverlay();
        console.error('ArcGIS updateProject failed:', err);
        // Rollback local project state. No task-side rollback needed —
        // tasks are linked by project_number, which the title change
        // didn't touch.
        Object.assign(PROJECTS[i], snapshot);
        markDirty();
        throw err;
      }
    } else {
      markDirty();
    }
    return PROJECTS[i];
  },

  async deleteProject(id, opts) {
    opts = opts || {};
    const i = PROJECTS.findIndex(function(p) { return p.objectId == id; });
    if (i < 0) return false;
    const project = PROJECTS[i];
    const objectId = project.objectId;
    const projectTitle = project.title;
    const projectNumber = project.project_number;
    const stamp = { deleted_at: Date.now(), deleted_by: (Auth && Auth.fullName) || 'Unknown' };

    // ── Cascade: soft-delete associated tasks ────────────
    var taskUpdates = [];
    TASKS.forEach(function(t) {
      if (projectNumber != null && t.project_number != null && String(t.project_number) === String(projectNumber) && t.objectId) {
        taskUpdates.push({ attributes: { ObjectId: t.objectId, deleted_at: stamp.deleted_at, deleted_by: stamp.deleted_by } });
      }
    });
    // Cascaded task objectIds — returned so an "Undo" can restore them too.
    var cascadedTaskIds = taskUpdates.map(function(u) { return u.attributes.ObjectId; });
    // Remove from local TASKS array
    TASKS = TASKS.filter(function(t) {
      if (projectNumber == null) return true;
      return !(t.project_number != null && String(t.project_number) === String(projectNumber));
    });
    if (taskUpdates.length > 0) {
      try {
        for (var ti = 0; ti < taskUpdates.length; ti += 100) {
          var batch = taskUpdates.slice(ti, ti + 100);
          await agolApplyEdits(ARCGIS_CONFIG.tasksUrl, { updates: batch });
        }
        console.log('[Cascade] Soft-deleted', taskUpdates.length, 'tasks for project:', projectTitle);
      } catch (err) {
        console.error('[Cascade] Failed to soft-delete tasks:', err);
      }
    }

    // ── Cascade: hard-delete allocations (allocations are not soft-deletable) ───
    try {
      var allocFeatures = await agolQuery(ARCGIS_CONFIG.allocationsUrl,
        "project='" + projectTitle.replace(/'/g, "''") + "'");
      var allocDeletes = allocFeatures.map(function(f) {
        return f.attributes.OBJECTID || f.attributes.ObjectId || f.attributes.objectid;
      }).filter(Boolean);
      if (allocDeletes.length > 0) {
        for (var ai = 0; ai < allocDeletes.length; ai += 100) {
          var aBatch = allocDeletes.slice(ai, ai + 100);
          await agolApplyEdits(ARCGIS_CONFIG.allocationsUrl, { deletes: aBatch });
        }
        console.log('[Cascade] Deleted', allocDeletes.length, 'allocation records for project:', projectTitle);
      }
    } catch (err) {
      console.error('[Cascade] Failed to delete allocations:', err);
    }

    // ── Soft-delete the project itself ───────────────────
    PROJECTS.splice(i, 1);
    if (objectId) {
      try {
        await agolApplyEdits(ARCGIS_CONFIG.projectsUrl, {
          updates: [{ attributes: { ObjectId: objectId, deleted_at: stamp.deleted_at, deleted_by: stamp.deleted_by } }]
        });
        markSynced('Project moved to trash');
        if (!opts.silent) showToast('Moved project "' + projectTitle + '" and ' + taskUpdates.length + ' task(s) to trash. Restore from Settings → Trash.', 'success');
      } catch (err) {
        console.error('ArcGIS soft-deleteProject failed:', err);
        markDirty();
      }
    }

    // Reload resources to reflect removed allocations (retry if AGOL lags)
    try {
      await reloadResourcesUntil(function() {
        if (!RESOURCES_DATA || !RESOURCES_DATA.people) return false;
        return !Object.keys(RESOURCES_DATA.people).some(function(nm) {
          return (RESOURCES_DATA.people[nm].allocations || []).some(function(a) { return a.project === projectTitle; });
        });
      }, 'project-delete');
    } catch(e) {}

    return { ok: true, objectId: objectId, taskObjectIds: cascadedTaskIds };
  },

  // ── Tasks ──────────────────────────────────────────────────────────
  getAllTasks()       { return TASKS; },
  getTask(taskId)    { return TASKS.find(function(t) { return t.objectId == taskId; }) || null; },

  async createTask(fields) {
    try {
      const id      = Math.max(0, ...TASKS.map(function(t) { return t.id; }))  + 1;
      const taskIdx = Math.max(0, ...TASKS.map(function(t) { return t.idx; })) + 1;
      fields.id  = id;
      fields.idx = taskIdx;
      // Auto-assign task number based on parent project
      if (!fields.task_number && fields.project) {
        var parentProj = PROJECTS.find(function(p) { return p.title === fields.project; });
        if (parentProj && parentProj.project_number) {
          fields.task_number = getNextTaskNumber(parentProj.project_number);
        }
      }
      // Auto-set working_due to match original due date on creation
      if (fields.due && !fields.working_due) fields.working_due = fields.due;
      if (fields.project) {
        const proj = PROJECTS.find(function(p) { return p.title === fields.project; });
        fields.project_id = proj ? proj.id : null;
        // Also set the canonical FK. The local task object pushed to TASKS
        // below is read by detail-page filters that key on project_number;
        // without this it lacks the field and won't appear until a reload.
        fields.project_number = proj ? proj.project_number : null;
      }
      const attrs = localToAgolTask(fields);
      const result = await agolApplyEdits(ARCGIS_CONFIG.tasksUrl, {
        adds: [{ attributes: attrs }]
      });
      const addResult = (result.addResults || [])[0];
      if (!addResult || !addResult.success) throw new Error('Add failed: ' + JSON.stringify(addResult));
      const task = Object.assign({ objectId: addResult.objectId }, fields);
      TASKS.push(task);
      markSynced('Task created');
      return task;
    } catch (err) {
      console.error('ArcGIS createTask failed:', err);
      showToast('Failed to create task: ' + err.message, 'error');
      if (!fields.id)  fields.id  = Math.max(0, ...TASKS.map(function(t) { return t.id; }))  + 1;
      if (!fields.idx) fields.idx = Math.max(0, ...TASKS.map(function(t) { return t.idx; })) + 1;
      if (fields.project && !fields.project_id) {
        const proj = PROJECTS.find(function(p) { return p.title === fields.project; });
        fields.project_id = proj ? proj.id : null;
        fields.project_number = proj ? proj.project_number : null;
      }
      const task = Object.assign({}, fields);
      TASKS.push(task);
      markDirty();
      return task;
    }
  },

  async updateTask(taskId, fields) {
    const i = TASKS.findIndex(function(t) { return t.objectId == taskId; });
    if (i < 0) return null;
    const oldTaskStatus = TASKS[i].status;
    // Auto-set actual_end when status changes to Complete
    if (fields.status === 'Complete' && !fields.actual_end && !TASKS[i].actual_end) {
      const today = new Date();
      fields.actual_end = today.getFullYear() + '-' + String(today.getMonth()+1).padStart(2,'0') + '-' + String(today.getDate()).padStart(2,'0');
    }
    // 🎉 Celebrate the moment of completion.
    if (typeof fireConfetti === 'function' && fields.status === 'Complete' && oldTaskStatus !== 'Complete') {
      fireConfetti({ count: 36 });
    }
    if (fields.project) {
      const proj = PROJECTS.find(function(p) { return p.title === fields.project; });
      fields.project_id = proj ? proj.id : null;
      fields.project_number = proj ? proj.project_number : null;
    }
    const snapshot = Object.assign({}, TASKS[i]);
    Object.assign(TASKS[i], fields);
    const objectId = TASKS[i].objectId;
    if (objectId) {
      try {
        const attrs = localToAgolTask(fields);
        attrs.ObjectId = objectId;
        await agolApplyEdits(ARCGIS_CONFIG.tasksUrl, {
          updates: [{ attributes: attrs }]
        });
        markSynced('Task updated');
      } catch (err) {
        console.error('ArcGIS updateTask failed:', err);
        Object.assign(TASKS[i], snapshot);
        markDirty();
        throw err;
      }
    } else {
      markDirty();
    }
    return TASKS[i];
  },

  async deleteTask(taskId) {
    const i = TASKS.findIndex(function(t) { return t.objectId == taskId; });
    if (i < 0) return false;
    const objectId = TASKS[i].objectId;
    TASKS.splice(i, 1);
    if (objectId) {
      try {
        const stamp = { deleted_at: Date.now(), deleted_by: (Auth && Auth.fullName) || 'Unknown' };
        await agolApplyEdits(ARCGIS_CONFIG.tasksUrl, {
          updates: [{ attributes: { ObjectId: objectId, deleted_at: stamp.deleted_at, deleted_by: stamp.deleted_by } }]
        });
        markSynced('Task moved to trash');
      } catch (err) {
        console.error('ArcGIS soft-deleteTask failed:', err);
        markDirty();
      }
    }
    return { ok: true, objectId: objectId };
  },

  // Undo a soft-delete: clear deleted_at/deleted_by on the given objectIds, then
  // reload local state so the records reappear. Mirrors restoreFromTrash but for
  // a known id set (an "Undo" right after deleting). Note: project allocations
  // are hard-deleted on delete and are NOT restored here — same as Trash restore.
  async restoreDeleted(sets) {
    sets = sets || {};
    async function clearDeleted(url, ids) {
      if (!url || !ids || !ids.length) return;
      for (var k = 0; k < ids.length; k += 100) {
        var updates = ids.slice(k, k + 100).map(function(id) {
          return { attributes: { ObjectId: id, deleted_at: null, deleted_by: null } };
        });
        await agolApplyEdits(url, { updates: updates });
      }
    }
    await clearDeleted(ARCGIS_CONFIG.projectsUrl, sets.projects);
    await clearDeleted(ARCGIS_CONFIG.tasksUrl, sets.tasks);
    await clearDeleted(ARCGIS_CONFIG.issuesUrl, sets.issues);
    // Reload so restored records repopulate the local arrays.
    var touchedPT = (sets.projects && sets.projects.length) || (sets.tasks && sets.tasks.length);
    if (touchedPT && typeof loadArcGISData === 'function') await loadArcGISData();
    if (sets.issues && sets.issues.length && typeof loadIssues === 'function') await loadIssues();
    if (typeof markDataDirty === 'function') markDataDirty();
    if (typeof render === 'function') render();
    return true;
  },
};
