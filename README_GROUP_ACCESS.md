# Group Access Update

- Admin and Employee have full UI/route access to Job Order and Job Done.
- Job Order and Job Done records are scoped by the logged-in user's `groupId`.
- Super Admin can see all groups.
- New Job Orders inherit the creator's group.
- Job Done inherits the source Job Order's group.
- Retirement remains visible to authorized staff, while Admin and Super Admin now have edit/delete/full management access.
- Parts Inventory is readable by staff because the Job Order repair flow needs to select a part; its route remains Super Admin-only and write restrictions remain enforced.
