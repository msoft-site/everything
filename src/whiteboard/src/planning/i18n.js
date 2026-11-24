import { addTranslations } from "../i18n.js";

// Canadian French for every planning string.
addTranslations({
  Tasks: "Tâches",
  tasks: "tâches",
  task: "tâche",
  Task: "Tâche",
  "Task card": "任务卡片",
  "Task details": "任务详情",
  "Task timeline": "任务时间轴",
  "Sticky note with status, owner, and dates": "带状态、负责人与日期的便签",
  "To do": "待办",
  "In progress": "En cours",
  Blocked: "Bloquée",
  // Core strings already translate these for other uses; a task's status
  // and priority are feminine.
  "task|Done": "已完成",
  "priority|None": "Aucune",
  "dependency|None": "Aucune",
  "one|{count} done": "{count} 项已完成",
  "{count} done": "{count} 项已完成",
  Low: "Basse",
  Medium: "Moyenne",
  High: "Haute",
  Status: "Statut",
  Assignee: "Responsable",
  Unassigned: "Non assignée",
  "On this board": "Sur ce tableau",
  "Not on this board": "Pas sur ce tableau",
  "Not on this board, so they are not notified and cannot open it. Share the board with them first.": "该成员未在此白板上，因此无法接收通知或打开。请先向其共享此白板。",
  Start: "Début",
  Due: "Échéance",
  "Start date": "开始日期",
  "Due date": "截止日期",
  Priority: "Priorité",
  Mixed: "Mixte",
  Frame: "Cadre",
  "No frame": "Aucun cadre",
  Close: "Fermer",
  Jira: "Jira",
  "Jira status": "Statut Jira",
  ID: "ID",
  Yes: "Oui",
  Overdue: "En retard",
  "Blocked by": "受阻于",
  Predecessors: "Prédécesseurs",
  "Blocked by other tasks": "受阻于其他任务",
  "Make task": "设为任务",
  "Remove task details": "移除任务详情",
  "Task details added.": "已添加任务详情。",
  "Task details removed.": "已移除任务详情。",
  "{count} selected object": "{count} 个选中对象",
  "{count} selected objects": "{count} 个选中对象",
  "{count} task": "{count} 个任务",
  "{count} tasks": "{count} 个任务",
  "Task details apply to every selected sticky note, shape, or text. Each change can be undone.": "任务详情将应用于每个选中的便签、形状或文本。所有更改均可撤销。",
  "You can view these task details but not change them.":
    "Vous pouvez consulter ces détails de tâche, mais pas les modifier.",
  "The start date must be on or before the due date.":
    "La date de début doit précéder ou égaler la date d’échéance.",
  "Enter a valid date, with a year from 100 to 9999.":
    "Entrez une date valide, dont l’année va de 100 à 9999.",
  "This selection is protected.": "此选择区域受保护。",
  "Select sticky notes, shapes, or text to plan tasks.": "选择sticky notes, shapes, or text to plan tasks.",
  "Send to Jira": "Envoyer vers Jira",
  "Send selected tasks to Jira": "Envoyer les tâches sélectionnées vers Jira",
  "Refresh Jira status": "Actualiser le statut Jira",
  "Jira issues created": "Billets Jira créés",
  "Not created": "Non créés",
  "Not sent yet": "Pas encore envoyées",
  "Send to Jira again to create them.":
    "Envoyez de nouveau vers Jira pour les créer.",
  "They are not linked to their tasks because the board was closed, locked, or became read-only.":
    "Ils ne sont pas liés à leurs tâches, car le tableau a été fermé, verrouillé ou est passé en lecture seule.",
  "Not linked because their tasks were deleted or linked by someone else meanwhile":
    "Non liés, car leurs tâches ont été supprimées ou liées par quelqu’un d’autre entre-temps",
  "Jira did not accept the request.": "Jira n’a pas accepté la demande.",
  "Jira refused the integration account. Check its email and API token in Organization settings.":
    "Jira a refusé le compte d’intégration. Vérifiez son adresse courriel et son jeton d’API dans les paramètres de l’organisation.",
  "Jira says": "Selon Jira",
  "Not found in Jira, so not updated":
    "Introuvables dans Jira, donc non mis à jour",
  "The others are up to date.": "Les autres sont à jour.",
  "Jira status updated": "Statut Jira mis à jour",
  "Jira status is up to date.": "Le statut Jira est à jour.",
  "No tasks are linked to Jira.": "Aucune tâche n’est liée à Jira.",
  "Could not reach Jira.": "Impossible de joindre Jira.",
  "Jira took too long. Send to Jira again to create the rest.":
    "Jira a mis trop de temps. Envoyez de nouveau à Jira pour créer le reste.",
  "Select tasks that are not linked to Jira yet.": "选择tasks that are not linked to Jira yet.",
  "Select tasks first.": "选择tasks first.",
  "Jira sync is available on organization boards. Share this board on your organization's server to use it.":
    "La synchronisation Jira est offerte sur les tableaux d’organisation. Partagez ce tableau sur le serveur de votre organisation pour l’utiliser.",
  "Join an organization to send tasks to Jira.":
    "Joignez-vous à une organisation pour envoyer des tâches vers Jira.",
  "Jira sync is available to organization members.":
    "La synchronisation Jira est offerte aux membres de l’organisation.",
  "This board is not on your organization's server, so it cannot use the organization's Jira connection.":
    "Ce tableau n’est pas sur le serveur de votre organisation; il ne peut donc pas utiliser la connexion Jira de l’organisation.",
  "Jira is not set up for your organization. Ask an administrator to enable it in organization settings.":
    "Jira n’est pas configuré pour votre organisation. Demandez à un administrateur de l’activer dans les paramètres de l’organisation.",
  "Jira is not set up for your organization.":
    "Jira n’est pas configuré pour votre organisation.",
  "Select items to send to Jira.": "选择items to send to Jira.",
  "Tasks are created in your organization's Jira project.":
    "Les tâches sont créées dans le projet Jira de votre organisation.",
  "planning|Summary": "Summary",
  Completion: "Avancement",
  "Completion (%)": "Avancement (%)",
  "Tasks per assignee": "Tâches par responsable",
  Measure: "Mesure",
  Value: "Valeur",
  Assigned: "Assignées",
  "All statuses": "Tous les statuts",
  Everyone: "Tout le monde",
  "All frames": "Tous les cadres",
  "All tasks": "Toutes les tâches",
  "Group by": "Regrouper par",
  "No grouping": "Aucun regroupement",
  "Sort by": "Trier par",
  "Due date, earliest first": "Échéance, la plus proche d’abord",
  "Due date, latest first": "Échéance, la plus éloignée d’abord",
  "Task name": "Nom de la tâche",
  "Overdue only": "En retard seulement",
  "Blocked only": "Bloquées seulement",
  "{count} task shown": "{count} tâche affichée",
  "{count} tasks shown": "{count} tâches affichées",
  "Showing {shown} of {total} tasks.": "{shown} tâches affichées sur {total}.",
  "Show more tasks": "显示more tasks",
  "No tasks match these filters.": "Aucune tâche ne correspond à ces filtres.",
  "No tasks yet. Select sticky notes, shapes, or text and choose Task details, or add a task card.":
    "Aucune tâche pour l’instant. Sélectionnez des notes adhésives, des formes ou du texte et choisissez Détails de la tâche, ou ajoutez une carte de tâche.",
  "Show on board": "Afficher sur le tableau",
  "Untitled task": "Tâche sans titre",
  "Planning views": "Vues de planification",
  List: "Liste",
  Timeline: "Chronologie",
  "Timeline chart": "Diagramme chronologique",
  "Task preview": "Aperçu de la tâche",
  Lanes: "Couloirs",
  Lane: "Couloir",
  Days: "Jours",
  to: "au",
  Today: "Aujourd’hui",
  "Show as table": "Afficher sous forme de tableau",
  "Place on board as timeline": "Placer sur le tableau comme chronologie",
  "Timeline placed on the board. Bars link to their tasks.":
    "Chronologie placée sur le tableau. Les barres renvoient à leurs tâches.",
  "It does not update by itself; select it and choose Refresh timeline when tasks change.":
    "Elle ne se met pas à jour d’elle-même; sélectionnez-la et choisissez Actualiser la chronologie quand les tâches changent.",
  "Refresh timeline": "Actualiser la chronologie",
  "Timeline refreshed from the board’s tasks.":
    "Chronologie actualisée à partir des tâches du tableau.",
  "Select a timeline placed from the Tasks view.": "选择a timeline placed from the Tasks view.",
  "This dependency would make these tasks wait for each other in a loop, so none of them could start.":
    "Cette dépendance ferait attendre ces tâches les unes les autres en boucle; aucune ne pourrait donc commencer.",
  "Tasks hidden from participants are left out.":
    "Les tâches masquées aux participants sont laissées de côté.",
  "These tasks are hidden from participants, so they are not placed on the board.":
    "Ces tâches sont masquées aux participants; elles ne sont donc pas placées sur le tableau.",
  "Add start or due dates to tasks first.": "添加start or due dates to tasks first.",
  "Add start or due dates to tasks to see them on the timeline.": "添加start or due dates to tasks to see them on the timeline.",
  "task has no dates and is not shown.":
    "tâche n’a pas de dates et n’est pas affichée.",
  "tasks have no dates and are not shown.":
    "tâches n’ont pas de dates et ne sont pas affichées.",
  "Use the arrow keys to move between bars. Press Enter to show a task on the board.":
    "Utilisez les touches fléchées pour passer d’une barre à l’autre. Appuyez sur Entrée pour afficher une tâche sur le tableau.",
  "Lines connect tasks to the tasks they block.":
    "Les lignes relient les tâches à celles qu’elles bloquent.",
  "This task is no longer on the board.":
    "Cette tâche n’est plus sur le tableau.",
  "Export CSV": "Exporter en CSV",
  "Export Excel": "Exporter en Excel",
  "Update task status when a task moves into a frame named after a status (Kanban)":
    "Mettre à jour le statut d’une tâche déplacée dans un cadre qui porte le nom d’un statut (Kanban)",
  "Kanban status sync is on for this board.":
    "La synchronisation des statuts Kanban est activée pour ce tableau.",
  "Kanban status sync is off.":
    "La synchronisation des statuts Kanban est désactivée.",
  "Turn on Kanban status sync": "Activer la synchronisation des statuts Kanban",
  "Turn off Kanban status sync":
    "Désactiver la synchronisation des statuts Kanban",
  "Status updated": "Statut mis à jour",
  "Statuses updated": "Statuts mis à jour",
  Dependency: "Dépendance",
  "Start blocks end": "Le début bloque la fin",
  "Start depends on end": "Le début dépend de la fin",
  "Invalid task details.": "Détails de tâche non valides.",
  "Invalid task dependency.": "Dépendance de tâche non valide.",
  "Invalid planning settings.": "Paramètres de planification non valides.",
});
