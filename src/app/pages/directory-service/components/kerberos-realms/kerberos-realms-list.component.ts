import {
  ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, OnInit,
} from '@angular/core';
import { UntilDestroy, untilDestroyed } from '@ngneat/until-destroy';
import { TranslateService } from '@ngx-translate/core';
import _ from 'lodash';
import {
  filter, map, switchMap, tap,
} from 'rxjs';
import { Role } from 'app/enums/role.enum';
import { helptextKerberosRealms } from 'app/helptext/directory-service/kerberos-realms-form-list';
import { AsyncDataProvider } from 'app/modules/ix-table2/classes/async-data-provider/async-data-provider';
import { actionsColumn } from 'app/modules/ix-table2/components/ix-table-body/cells/ix-cell-actions/ix-cell-actions.component';
import { textColumn } from 'app/modules/ix-table2/components/ix-table-body/cells/ix-cell-text/ix-cell-text.component';
import { SortDirection } from 'app/modules/ix-table2/enums/sort-direction.enum';
import { createTable } from 'app/modules/ix-table2/utils';
import { EmptyService } from 'app/modules/ix-tables/services/empty.service';
import { KerberosRealmRow } from 'app/pages/directory-service/components/kerberos-realms/kerberos-realm-row.interface';
import { KerberosRealmsFormComponent } from 'app/pages/directory-service/components/kerberos-realms-form/kerberos-realms-form.component';
import { DialogService } from 'app/services/dialog.service';
import { ErrorHandlerService } from 'app/services/error-handler.service';
import { IxSlideInService } from 'app/services/ix-slide-in.service';
import { WebSocketService } from 'app/services/ws.service';

@UntilDestroy()
@Component({
  selector: 'ix-kerberos-realms-list',
  templateUrl: './kerberos-realms-list.component.html',
  styleUrls: ['./kerberos-realms-list.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class KerberosRealmsListComponent implements OnInit {
  @Input() paginator = true;
  @Input() toolbar = false;

  readonly requiredRoles = [Role.DirectoryServiceWrite];

  filterString = '';
  dataProvider: AsyncDataProvider<KerberosRealmRow>;
  kerberosRealsm: KerberosRealmRow[] = [];
  columns = createTable<KerberosRealmRow>([
    textColumn({
      title: this.translateService.instant('Realm'),
      propertyName: 'realm',
      sortable: true,
    }),
    textColumn({
      title: this.translateService.instant('KDC'),
      propertyName: 'kdc_string',
      sortable: true,
    }),
    textColumn({
      title: this.translateService.instant('Admin Server'),
      propertyName: 'admin_server_string',
      sortable: true,
    }),
    textColumn({
      title: this.translateService.instant('Password Server'),
      propertyName: 'kpasswd_server_string',
      sortable: true,
    }),
    actionsColumn({
      actions: [
        {
          iconName: 'edit',
          tooltip: this.translateService.instant('Edit'),
          onClick: (row) => {
            const slideInRef = this.slideInService.open(KerberosRealmsFormComponent, { data: row });
            slideInRef.slideInClosed$.pipe(
              untilDestroyed(this),
            ).subscribe(() => this.getKerberosRealms());
          },
        },
        {
          iconName: 'delete',
          tooltip: this.translateService.instant('Delete'),
          requiredRoles: this.requiredRoles,
          onClick: (row) => {
            this.dialogService.confirm({
              title: this.translateService.instant(helptextKerberosRealms.krb_realmlist_deletemessage_title),
              message: this.translateService.instant('Are you sure you want to delete this item?'),
            }).pipe(
              filter(Boolean),
              switchMap(() => this.ws.call('kerberos.realm.delete', [row.id])),
              untilDestroyed(this),
            ).subscribe({
              error: (error: unknown) => {
                this.dialogService.error(this.errorHandler.parseError(error));
              },
              complete: () => {
                this.getKerberosRealms();
              },
            });
          },
        },
      ],
    }),
  ], {
    rowTestId: (row) => 'kerberos-realm-' + row.realm,
  });

  constructor(
    private translateService: TranslateService,
    private ws: WebSocketService,
    protected dialogService: DialogService,
    private cdr: ChangeDetectorRef,
    private errorHandler: ErrorHandlerService,
    protected emptyService: EmptyService,
    private slideInService: IxSlideInService,
  ) { }

  ngOnInit(): void {
    const kerberosRealsm$ = this.ws.call('kerberos.realm.query').pipe(
      map((realms) => {
        return realms.map((realm) => {
          return {
            ...realm,
            kdc_string: realm.kdc?.join(', '),
            admin_server_string: realm.admin_server?.join(', '),
            kpasswd_server_string: realm.kpasswd_server?.join(', '),
          };
        });
      }),
      tap((kerberosRealsm) => this.kerberosRealsm = kerberosRealsm),
      untilDestroyed(this),
    );
    this.dataProvider = new AsyncDataProvider<KerberosRealmRow>(kerberosRealsm$);
    this.setDefaultSort();
    this.getKerberosRealms();
  }

  getKerberosRealms(): void {
    this.dataProvider.load();
  }

  setDefaultSort(): void {
    this.dataProvider.setSorting({
      active: 1,
      direction: SortDirection.Asc,
      propertyName: 'realm',
    });
  }

  doAdd(): void {
    const slideInRef = this.slideInService.open(KerberosRealmsFormComponent);
    slideInRef.slideInClosed$.pipe(
      untilDestroyed(this),
    ).subscribe(() => this.getKerberosRealms());
  }

  onListFiltered(query: string): void {
    this.filterString = query.toLowerCase();
    this.dataProvider.setRows(this.kerberosRealsm.filter((idmap) => {
      return _.find(idmap, query);
    }));
  }
}
