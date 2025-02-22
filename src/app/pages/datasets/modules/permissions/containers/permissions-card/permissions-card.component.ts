import {
  ChangeDetectionStrategy, Component, Input, OnChanges, OnInit, ChangeDetectorRef,
} from '@angular/core';
import { Router } from '@angular/router';
import { UntilDestroy, untilDestroyed } from '@ngneat/until-destroy';
import { TranslateService } from '@ngx-translate/core';
import { AclType } from 'app/enums/acl-type.enum';
import { EmptyType } from 'app/enums/empty-type.enum';
import { NfsAclTag } from 'app/enums/nfs-acl.enum';
import { Role } from 'app/enums/role.enum';
import { Acl } from 'app/interfaces/acl.interface';
import { DatasetDetails } from 'app/interfaces/dataset.interface';
import { EmptyConfig } from 'app/interfaces/empty-config.interface';
import { FileSystemStat } from 'app/interfaces/filesystem-stat.interface';
import { PermissionsCardStore } from 'app/pages/datasets/modules/permissions/stores/permissions-card.store';
import { isRootDataset } from 'app/pages/datasets/utils/dataset.utils';
import { DialogService } from 'app/services/dialog.service';
import { ErrorHandlerService } from 'app/services/error-handler.service';

@UntilDestroy()
@Component({
  selector: 'ix-permissions-card',
  templateUrl: 'permissions-card.component.html',
  styleUrls: ['./permissions-card.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PermissionsCardComponent implements OnInit, OnChanges {
  @Input() dataset: DatasetDetails;

  readonly requiredRoles = [Role.DatasetWrite];

  isLoading: boolean;
  isMissingMountpoint: boolean;
  stat: FileSystemStat;
  acl: Acl;

  emptyConfig: EmptyConfig = {
    type: EmptyType.NoPageData,
    title: this.translate.instant('No Data'),
  };

  missionMountpointEmptyConfig: EmptyConfig = {
    type: EmptyType.NoPageData,
    title: this.translate.instant('Dataset has no mountpoint'),
  };

  readonly AclType = AclType;

  constructor(
    private store: PermissionsCardStore,
    private cdr: ChangeDetectorRef,
    private errorHandler: ErrorHandlerService,
    private dialogService: DialogService,
    private router: Router,
    private translate: TranslateService,
  ) {}

  redirectToEditPermissions(): void {
    if (this.acl.trivial) {
      this.router.navigate(['/datasets', this.dataset.id, 'permissions', 'edit']);
    } else {
      this.router.navigate(['/datasets', 'acl', 'edit'], { queryParams: { path: '/mnt/' + this.dataset.id } });
    }
  }

  get canEditPermissions(): boolean {
    return this.acl && !isRootDataset(this.dataset) && !this.dataset.locked;
  }

  ngOnChanges(): void {
    this.loadPermissions();
  }

  ngOnInit(): void {
    this.store.state$
      .pipe(untilDestroyed(this))
      .subscribe({
        next: (state) => {
          this.isLoading = state.isLoading;
          this.acl = state.acl;
          this.stat = state.stat;

          // TODO: Move elsewhere
          if (this.acl?.acl && this.acl.acltype === AclType.Nfs4) {
            for (const acl of this.acl.acl) {
              if (acl.tag === NfsAclTag.Owner && acl.who === null) {
                acl.who = this.acl.uid.toString();
              }
              if ((acl.tag === NfsAclTag.Group || acl.tag === NfsAclTag.UserGroup) && acl.who === null) {
                acl.who = this.acl.gid.toString();
              }
            }
          }

          this.cdr.markForCheck();
        },
        error: (error: unknown) => {
          this.isLoading = false;
          this.cdr.markForCheck();
          this.dialogService.error(this.errorHandler.parseError(error));
        },
      });
  }

  private loadPermissions(): void {
    this.isMissingMountpoint = !this.dataset.mountpoint;
    if (this.isMissingMountpoint) {
      return;
    }
    this.store.loadPermissions(this.dataset.mountpoint);
  }
}
